#!/usr/bin/env python3
"""Read-only API checks by default; --exercise creates synthetic server test fixtures.
Does not load a native phone plugin or dial any telephone number.
Credentials are read from environment/stdin and never printed.
"""
import argparse
import datetime as dt
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

class ApiFailure(Exception):
    pass

class Client:
    def __init__(self, base, tenant, token):
        self.base = base.rstrip('/')
        self.headers = {'Content-Type': 'application/json', 'tenant-id': tenant}
        if token:
            self.headers['Authorization'] = 'Bearer ' + token

    def request(self, method, path, body=None, key=None):
        headers = dict(self.headers)
        if key:
            headers['Idempotency-Key'] = key
        payload = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise ApiFailure(f'{method} {path.split("?")[0]}: HTTP {error.code}') from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            raise ApiFailure(f'{method} {path.split("?")[0]}: unreachable or invalid response') from None
        if result.get('code') != 0 or result.get('error'):
            # Do not print server messages/bodies that may contain private input.
            raise ApiFailure(f'{method} {path.split("?")[0]}: business code {result.get("code", "error")}')
        return result.get('data')

def require(value, message):
    if not value:
        raise ApiFailure(message)

def timestamp(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')

def exercise(client):
    admin = '/admin-api/callphone'
    mobile = '/api/v1/mobile'
    customer = device = pairing = None
    try:
        customer = client.request('POST', admin + '/customer/save', {
            'name': '集成验收-' + uuid.uuid4().hex[:8], 'phone': '13800000000',
            'stage': 'new', 'source': 'integration-smoke', 'tags': '验收合成数据'})
        require(customer, 'Customer fixture not created')
        pairing = client.request('POST', admin + '/device/pairing-code/create')
        require(pairing and pairing.get('pairingCode'), 'Pairing code missing')
        claimed = client.request('POST', mobile + '/pairings/claim', {
            'pairing_code': pairing['pairingCode'], 'display_name': 'API验收虚拟Android（不会拨号）', 'platform': 'android'})
        require(claimed and claimed.get('device_key'), 'Pairing not claimed')
        device = claimed['device_id']
        client.headers.update({'X-Callphone-Device-Id': str(device), 'X-Callphone-Device-Key': claimed['device_key']})
        require(client.request('POST', mobile + '/devices/heartbeat'), 'Heartbeat rejected')
        require(client.request('GET', mobile + '/devices/current')['paired'], 'Current device missing')
        require(client.request('GET', admin + '/device/pairing-code/get?id=' + str(pairing['id']))['status'] == 'claimed', 'PC pairing state did not change')
        rows = client.request('GET', mobile + '/customers?scope=all&page=1&page_size=20')
        require(rows and 'items' in rows, 'Mobile page contract missing items')
        require(client.request('GET', mobile + '/customers/' + str(customer))['id'] == str(customer), 'Mobile customer unavailable')
        body = {'customerId': str(customer), 'deviceId': str(device), 'source': 'customer_detail'}
        dispatch_key = str(uuid.uuid4())
        dispatch = client.request('POST', admin + '/call-dispatch/create', body, dispatch_key)
        replay = client.request('POST', admin + '/call-dispatch/create', body, dispatch_key)
        require(dispatch['id'] == replay['id'], 'Dispatch idempotency failed')
        pending = client.request('GET', mobile + '/call-dispatches')
        require(any(row['id'] == str(dispatch['id']) for row in pending['items']), 'PC dispatch absent on mobile')
        event = str(uuid.uuid4())
        begin = {'source': 'pc_dispatch', 'dispatch_id': str(dispatch['id']), 'device_event_id': event}
        call = client.request('POST', mobile + '/calls', begin, event)
        require(call and call.get('phone_number'), 'Dispatch not accepted')
        require(client.request('POST', mobile + '/calls', begin, event)['call_id'] == call['call_id'], 'Call acceptance idempotency failed')
        now = dt.datetime.now(dt.timezone.utc)
        completion = {'device_event_id': str(uuid.uuid4()), 'result_code': 'no_answer',
                      'started_at': timestamp(now), 'ended_at': timestamp(now), 'duration_seconds': 0,
                      'recording_available': False, 'note': 'API合成验收；未拨打真实电话'}
        completion_key = str(uuid.uuid4())
        path = mobile + '/calls/' + call['call_id'] + '/complete'
        require(client.request('POST', path, completion, completion_key), 'Completion rejected')
        require(client.request('POST', path, completion, completion_key), 'Completion replay rejected')
        record = client.request('GET', admin + '/call-record/get?id=' + call['call_id'])
        require(record['status'] == 'ended' and record['resultCode'] == 'no_answer' and record['durationSeconds'] == 0, 'PC record does not match mobile result')
        observation = {'device_event_id': str(uuid.uuid4()), 'ended_at': completion['ended_at'], 'duration_seconds': 0}
        observed_path = mobile + '/calls/' + call['call_id'] + '/observed-end'
        require(client.request('POST', observed_path, observation), 'Late end observation rejected')
        require(client.request('POST', observed_path, observation), 'Late end observation replay rejected')
        observed_record = client.request('GET', admin + '/call-record/get?id=' + call['call_id'])
        require(observed_record['resultCode'] == 'no_answer' and observed_record['durationSeconds'] == 0,
                'Observation replay changed the saved result')
        detail = client.request('GET', mobile + '/customers/' + str(customer))
        require(detail['last_call_result'] == 'no_answer', 'Customer latest call not updated')
        declined = client.request('POST', admin + '/call-dispatch/create', body, str(uuid.uuid4()))
        require(client.request('POST', mobile + '/call-dispatches/' + str(declined['id']) + '/decline',
                               {'reason_code': 'not_available', 'device_event_id': str(uuid.uuid4())}), 'Decline rejected')
        require(client.request('GET', admin + '/call-dispatch/get?id=' + str(declined['id']))['status'] == 'declined', 'PC decline status missing')
        cancelled = client.request('POST', admin + '/call-dispatch/create', body, str(uuid.uuid4()))
        require(client.request('POST', admin + '/call-dispatch/cancel', {'id': cancelled['id']}), 'Cancel rejected')
        require(client.request('GET', admin + '/call-dispatch/get?id=' + str(cancelled['id']))['status'] == 'cancelled', 'PC cancel status missing')
        require(client.request('POST', admin + '/device/revoke', {'id': device}), 'Revoke rejected')
        try:
            client.request('POST', mobile + '/devices/heartbeat')
        except ApiFailure:
            pass
        else:
            raise ApiFailure('Revoked device credentials were accepted')
        print('PASS pairing / heartbeat / customers / dispatch / result / replay / observed-end / decline / cancel / revoke')
    finally:
        # Archive only our newly created fixture; retained audit/record rows are intentional.
        cleanups = []
        if device:
            cleanups.append(('/device/revoke', {'id': device}))
        if pairing:
            cleanups.append(('/device/pairing-code/cancel', {'id': pairing['id']}))
        for path, body in cleanups:
            try:
                client.request('POST', admin + path, body)
            except ApiFailure:
                print('Cleanup needs review:', path, file=sys.stderr)
        if customer:
            try:
                client.request('POST', admin + '/customer/archive?id=' + str(customer))
            except ApiFailure:
                print('Synthetic customer archive needs review; see integration-smoke fixtures.', file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default=os.environ.get('CALLPHONE_BASE_URL', 'http://127.0.0.1:48080'))
    parser.add_argument('--tenant', default=os.environ.get('CALLPHONE_TENANT_ID', '1'))
    parser.add_argument('--exercise', action='store_true', help='Create/claim synthetic fixtures in a test workspace; no physical dialing')
    args = parser.parse_args()
    base = urllib.parse.urlsplit(args.base_url)
    require(base.scheme in ('http', 'https') and base.netloc and not base.username and not base.query and not base.fragment, 'Invalid service URL')
    client = Client(args.base_url, args.tenant, os.environ.get('CALLPHONE_ACCESS_TOKEN', ''))
    if not client.headers.get('Authorization'):
        username = os.environ.get('CALLPHONE_USERNAME') or input('Test account: ')
        password = os.environ.get('CALLPHONE_PASSWORD') or getpass.getpass('Password: ')
        session = client.request('POST', '/admin-api/system/auth/login', {'username': username, 'password': password})
        require(session and session.get('accessToken'), 'Login unsuccessful; if captcha is enabled, sign in through UI and supply CALLPHONE_ACCESS_TOKEN securely')
        client.headers['Authorization'] = 'Bearer ' + session['accessToken']
    require(client.request('GET', '/api/v1/mobile/bootstrap'), 'Mobile bootstrap unavailable')
    require(client.request('GET', '/admin-api/callphone/customer/page?pageNo=1&pageSize=10') is not None, 'PC customer API unavailable')
    require(client.request('GET', '/admin-api/callphone/call-record/page?pageNo=1&pageSize=10') is not None, 'PC records API unavailable')
    print('PASS authenticated PC + canonical mobile API read checks')
    if args.exercise:
        exercise(client)
    else:
        print('Read-only run. Use --exercise only in a test workspace for server workflow checks.')

if __name__ == '__main__':
    try:
        main()
    except (ApiFailure, KeyboardInterrupt, EOFError) as error:
        print('FAIL:', str(error) or 'interrupted', file=sys.stderr)
        sys.exit(1)
