import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { workspacePath } from '../../src/work-files.js';
import { ApiError } from '../../src/validation.js';

const fail = message => { throw new ApiError(400, 'LEAD_IMPORT_INVALID', message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

/** Strict CSV, including escaped quotes/newlines. Never evaluate cells or silently guess encoding. */
export function parseLeadCsv(text) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  const cell = () => { row.push(field); field = ''; closed = false; if (row.length > 40) fail('最多支持 40 列'); };
  const record = () => { cell(); rows.push(row); row = []; if (rows.length > 501) fail('每次最多导入 500 行'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') cell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; record(); }
    else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') fail('CSV 引号格式不正确'); field += c; }
    if (field.length > 10000) fail('单元格内容过长');
  }
  if (quoted) fail('CSV 引号未闭合');
  if (field || row.length || closed) record();
  if (rows.length < 2) fail('文件需要表头和至少一条线索');
  const headers = rows.shift().map(s => s.trim());
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) fail('表头为空或重复，请先整理文件');
  return { headers, rows };
}

export async function prepareLeadImport(ctx, input) {
  const resource = ctx.resources.find(r => r.id === input.resource_id);
  if (!resource || !/\.csv$/i.test(resource.name)) fail('请关联一个 UTF-8 CSV 线索文件');
  const path = await workspacePath(ctx.cwd, resource.path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 5 * 1024 * 1024) fail('线索文件须为 5 MiB 以内的普通 CSV 文件');
  const bytes = await readFile(path);
  if (bytes.length > 5 * 1024 * 1024 || hash(bytes) !== resource.sha256) fail('原始附件已被修改，请重新上传');
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('请将文件另存为 UTF-8 CSV'); }
  const { headers, rows } = parseLeadCsv(decoded);
  const aliases = { name: ['姓名', '称呼', 'name'], phone: ['手机号', '电话', '号码', 'phone'], sourceCode: ['来源', '来源编码', 'sourceCode'], score: ['评分', 'score'] };
  const columns = {};
  for (const [key, names] of Object.entries(aliases)) {
    const selected = input.columns?.[key];
    const matches = selected ? headers.filter(h => h === selected) : headers.filter(h => names.includes(h));
    if (matches.length > 1 || selected && !matches.length) fail('字段映射不明确，请指定文件中的确切列名');
    columns[key] = matches[0] || null;
  }
  if (!columns.name || !columns.phone) fail('需要姓名和号码列；可通过 columns 指定实际表头');
  const fingerprint = hash(JSON.stringify({ sha256: resource.sha256, columns }));
  const valid = [], invalid = [];
  rows.forEach((cells, index) => {
    const rowNo = index + 2;
    const value = key => columns[key] ? cells[headers.indexOf(columns[key])]?.trim() || '' : '';
    const name = value('name'), phone = value('phone'), sourceCode = value('sourceCode'), rawScore = value('score');
    if (cells.length !== headers.length || !name || name.length > 80 || !/^\+?[0-9][0-9 -]{5,19}$/.test(phone)
      || sourceCode.length > 64 || rawScore && (!/^\d+$/.test(rawScore) || Number(rawScore) > 100)) {
      invalid.push({ rowNo, status: 'failed', message: '列数、姓名、号码、来源或评分格式不正确' }); return;
    }
    valid.push({ rowNo, lead: { name, phone, sourceCode: sourceCode || null, score: rawScore ? Number(rawScore) : 0 } });
  });
  return { resource, fingerprint, columns, valid, invalid, total: rows.length };
}

/** Host-only bridge credentials never enter SDK environment, prompt, workspace or tool schema. */
export function createLeadBridge({ url = process.env.WORK_BUSINESS_URL, token = process.env.AGENT_INTERNAL_TOKEN, fetchImpl = fetch } = {}) {
  if (!url) return null;
  const endpoint = new URL(url);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !token || token.length < 32) throw new Error('Invalid Work business configuration');
  return async (identity, input, signal) => {
    if (!/^[0-9]{1,19}$/.test(identity?.tenant || '') || !/^[1-9][0-9]{0,18}$/.test(identity?.user || '')) throw new Error('Invalid Work identity');
    const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      headers: { 'Content-Type': 'application/json', 'tenant-id': identity.tenant, 'X-AI-User': identity.user, 'X-Work-Internal-Token': token }, body: JSON.stringify(input) });
    if (!response.ok) throw new ApiError(response.status, 'LEAD_IMPORT_UNAVAILABLE', response.status === 403 ? '当前账号无权导入线索' : '导入结果待核对，请用原文件重试');
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.data.length !== input.rows.length) throw new Error('Invalid import receipt');
    const seen = new Set();
    return payload.data.map(row => {
      if (!input.rows.some(r => r.rowNo === row.rowNo) || seen.has(row.rowNo) || !['imported', 'duplicate', 'failed', 'unknown'].includes(row.status)
        || ['imported', 'duplicate'].includes(row.status) && !/^[1-9][0-9]{0,18}$/.test(row.leadId)) throw new Error('Invalid import receipt');
      seen.add(row.rowNo);
      return { rowNo: row.rowNo, status: row.status, leadId: row.leadId || null,
        message: ({ imported: '已创建线索', duplicate: '此行已导入，未重复创建', failed: '未保存，请检查数据或原记录', unknown: '结果待核对，请用原文件重试' })[row.status] };
    });
  };
}

export function createLeadTools(sdk, z, ctx, bridge) {
  const columns = z.object({ name: z.string().optional(), phone: z.string().optional(), sourceCode: z.string().optional(), score: z.string().optional() }).optional();
  const schema = { resource_id: z.string().uuid(), columns };
  const safe = fn => async input => { try { return result(await fn(input)); } catch (error) {
    return { isError: true, ...result({ error: error instanceof ApiError ? error.message : '线索导入未完成，请核对回执后重试' }) };
  } };
  return [
    sdk.tool('preview_lead_import', 'Validate an attached UTF-8 CSV for lead import without writing business data. Returns fingerprint, exact column mapping, row errors and counts.', schema, safe(async input => {
      const p = await prepareLeadImport(ctx, input);
      return { resource_id: p.resource.id, file_name: p.resource.name, fingerprint: p.fingerprint, columns: p.columns,
        total: p.total, valid: p.valid.length, invalid: p.invalid, destination: '线索池；沿用后台现有自动分配设置' };
    }), { annotations: { readOnlyHint: true } }),
    sdk.tool('import_leads', 'Import valid rows from the original attached CSV into Call Phone. Requires the preview fingerprint. Invalid rows are skipped and reported; same actor/file/mapping/row retries are idempotent. Does not dial or convert leads.', { ...schema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }, safe(async input => {
      const p = await prepareLeadImport(ctx, input);
      if (p.fingerprint !== input.fingerprint) fail('预览已变化，请重新检查字段映射');
      const rows = [...p.invalid];
      for (let start = 0; start < p.valid.length; start += 50) {
        if (ctx.signal.aborted) break;
        const batch = p.valid.slice(start, start + 50);
        try { rows.push(...await bridge(ctx.identity, { fingerprint: p.fingerprint, rows: batch }, ctx.signal)); }
        catch (error) {
          const denied = error instanceof ApiError && [400, 401, 403].includes(error.status);
          rows.push(...batch.map(r => ({ rowNo: r.rowNo, status: denied ? 'failed' : 'unknown', message: denied ? '账号权限或请求校验未通过' : '结果待核对，请用原文件重试' })));
          break;
        }
      }
      const done = new Set(rows.map(r => r.rowNo));
      rows.push(...p.valid.filter(r => !done.has(r.rowNo)).map(r => ({ rowNo: r.rowNo, status: 'not_attempted', message: '本次未执行' })));
      rows.sort((a, b) => a.rowNo - b.rowNo);
      const receipt = { kind: 'lead_import', fingerprint: p.fingerprint, resource_id: p.resource.id, file_name: p.resource.name, total: p.total,
        imported: rows.filter(r => r.status === 'imported').length, duplicate: rows.filter(r => r.status === 'duplicate').length,
        failed: rows.filter(r => r.status === 'failed').length, unknown: rows.filter(r => r.status === 'unknown').length,
        not_attempted: rows.filter(r => r.status === 'not_attempted').length, rows };
      await ctx.emitResult({ title: `线索导入 · ${p.resource.name}`,
        summary: `新增 ${receipt.imported} · 已导入过 ${receipt.duplicate} · 失败 ${receipt.failed} · 待核对 ${receipt.unknown} · 未执行 ${receipt.not_attempted}`,
        rows: rows.map(row => ({ label: `第 ${row.rowNo} 行`, status: ({ imported: '已导入', duplicate: '已导入过', failed: '未导入', unknown: '待核对', not_attempted: '未执行' })[row.status], detail: row.leadId ? `线索 ID：${row.leadId}` : row.message })) });
      return receipt;
    }), { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }),
  ];
}
