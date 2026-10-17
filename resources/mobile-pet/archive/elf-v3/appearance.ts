import emotionsA from './assets/elf-emotions-a-v3.png';
import emotionsB from './assets/elf-emotions-b-v3.png';
import actions from './assets/elf-actions-v3.png';

export type PetFrame = { cell: number; duration: number };
export type PetAction = {
  id: string; label: string; group: string; sheet: number; frames: PetFrame[];
  repeats: number;
};
export const elfSheets = [emotionsA, emotionsB, actions].map(image => ({ image, columns: 6, rows: 4 }));
function rowFrames(row: number, durations: number[]): PetFrame[] {
  return durations.map((duration, column) => ({ cell: row * 6 + column, duration }));
}
function action(id: string, label: string, sheet: number, row: number, durations: number[],
  repeats = 3): PetAction {
  return { id, label, group: sheet === 2 ? '动作' : '情绪', sheet,
    frames: rowFrames(row, durations), repeats };
}
// Each row is its own clip. Rest holds keep blinking from becoming a rapid flicker.
export const elfActions: PetAction[] = [
  action('idle', '待机', 0, 0, [2600, 90, 110, 90, 140, 1000], 0),
  action('happy', '开心', 0, 1, [220, 120, 240, 140, 160, 220]),
  action('shy', '害羞', 0, 2, [220, 180, 250, 180, 180, 220]),
  action('sad', '难过', 0, 3, [260, 220, 300, 220, 220, 260]),
  action('angry', '生气', 1, 0, [220, 170, 220, 160, 180, 220]),
  action('surprised', '惊讶', 1, 1, [180, 140, 240, 180, 140, 220]),
  action('sleepy', '困倦', 1, 2, [260, 220, 300, 260, 220, 300]),
  action('thinking', '思考', 1, 3, [240, 220, 260, 220, 240, 260]),
  action('wave', '挥手', 2, 0, [140, 140, 140, 140, 140, 140]),
  action('nod', '点头', 2, 1, [200, 120, 160, 120, 180, 200]),
  action('celebrate', '庆祝', 2, 2, [160, 120, 180, 200, 140, 160]),
  action('stretch', '伸懒腰', 2, 3, [220, 180, 260, 300, 200, 220]),
];
export const elfSheet = emotionsA;
export const elfFrames = elfActions[0].frames;
