// Reference-inspired doll artwork: the same golden fringe and black hood as MascotMark.
// A small deterministic rasterizer keeps icon generation offline and dependency free.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type Point = [number, number];
type RGB = [number, number, number];
type Shape =
  | { kind: 'ellipse'; center: Point; radius: Point; color: string }
  | { kind: 'polygon'; points: Point[]; color: string }
  | { kind: 'line'; points: Point[]; width: number; color: string };
const shapes: Shape[] = [];
const ellipse = (x: number, y: number, rx: number, ry: number, color: string) =>
  shapes.push({ kind: 'ellipse', center: [x, y], radius: [rx, ry], color });
const polygon = (points: Point[], color: string) => shapes.push({ kind: 'polygon', points, color });
const curve = (start: Point, control: Point, end: Point, width: number, color: string) => {
  const points = Array.from({ length: 33 }, (_, index): Point => {
    const t = index / 32;
    return [0, 1].map(
      (axis) => (1 - t) ** 2 * start[axis] + 2 * (1 - t) * t * control[axis] + t ** 2 * end[axis],
    ) as Point;
  });
  shapes.push({ kind: 'line', points, width, color });
};
const background = '#E8F7FF';
const hood = '#202328';
const ink = '#25231F';

// 240-unit design space. A little breathing room preserves the face under iOS masks.
polygon(
  [
    [49, 113],
    [45, 96],
    [44, 77],
    [48, 55],
    [58, 36],
    [70, 25],
    [84, 15],
    [101, 15],
    [145, 15],
    [163, 19],
    [174, 29],
    [182, 40],
    [190, 61],
    [194, 85],
    [191, 112],
    [181, 142],
    [167, 156],
    [148, 162],
    [120, 165],
    [92, 162],
    [73, 155],
    [57, 143],
  ],
  hood,
);
curve([63, 61], [66, 32], [91, 25], 4, '#30343A');
curve([151, 26], [178, 38], [179, 66], 4, '#30343A');
ellipse(120, 104, 62, 58, '#C99225');
polygon(
  [
    [62, 113],
    [58, 99],
    [64, 94],
    [61, 84],
    [70, 81],
    [69, 70],
    [80, 69],
    [84, 59],
    [94, 62],
    [103, 52],
    [113, 57],
    [125, 50],
    [135, 57],
    [147, 54],
    [153, 63],
    [164, 64],
    [165, 76],
    [174, 81],
    [171, 93],
    [176, 103],
    [170, 113],
    [171, 127],
    [162, 133],
    [155, 144],
    [141, 143],
    [128, 148],
    [114, 144],
    [100, 146],
    [92, 136],
    [81, 134],
    [78, 122],
  ],
  '#E4B63E',
);
ellipse(66, 117, 13, 17, '#E7AC62');
ellipse(174, 117, 13, 17, '#E7AC62');
ellipse(66, 117, 7, 10, '#CF8F4E');
ellipse(174, 117, 7, 10, '#CF8F4E');
ellipse(120, 114, 46, 45, '#EDBA79');
ellipse(120, 132, 35, 25, '#F2C78D');
polygon(
  [
    [66, 94],
    [63, 85],
    [66, 79],
    [72, 75],
    [72, 67],
    [78, 62],
    [83, 61],
    [89, 55],
    [99, 55],
    [107, 50],
    [117, 52],
    [124, 48],
    [134, 50],
    [145, 51],
    [152, 56],
    [161, 59],
    [166, 66],
    [172, 73],
    [172, 84],
    [164, 98],
    [154, 88],
    [150, 78],
    [142, 91],
    [133, 76],
    [123, 90],
    [115, 77],
    [104, 90],
    [98, 78],
    [88, 93],
    [81, 84],
    [73, 100],
  ],
  '#EDC64E',
);
for (const [start, end] of [
  [
    [79, 74],
    [85, 67],
  ],
  [
    [99, 64],
    [104, 60],
  ],
  [
    [124, 61],
    [129, 58],
  ],
  [
    [145, 67],
    [151, 73],
  ],
  [
    [84, 100],
    [87, 95],
  ],
  [
    [156, 99],
    [153, 93],
  ],
] as [Point, Point][]) {
  shapes.push({ kind: 'line', points: [start, end], width: 4, color: '#F7D96B' });
}
ellipse(88, 129, 8, 5, '#EDAE79');
ellipse(152, 129, 8, 5, '#EDAE79');
ellipse(99, 108, 7, 9, ink);
ellipse(141, 108, 7, 9, ink);
ellipse(97, 104, 2.6, 2.6, '#FFFFFF');
ellipse(139, 104, 2.6, 2.6, '#FFFFFF');
ellipse(102, 111, 1, 1, '#A28B6B');
ellipse(144, 111, 1, 1, '#A28B6B');
for (const [start, end] of [
  [
    [93, 102],
    [91, 98],
  ],
  [
    [98, 99],
    [97, 95],
  ],
  [
    [105, 101],
    [107, 98],
  ],
  [
    [135, 102],
    [133, 98],
  ],
  [
    [140, 99],
    [139, 95],
  ],
  [
    [147, 101],
    [149, 98],
  ],
] as [Point, Point][]) {
  shapes.push({ kind: 'line', points: [start, end], width: 2, color: ink });
}
ellipse(120, 125, 8.5, 6.5, '#242321');
ellipse(117, 123, 3, 1.5, '#6B6960');
for (const [x, y] of [
  [88, 120],
  [93, 125],
  [86, 126],
  [152, 120],
  [147, 125],
  [154, 126],
])
  ellipse(x, y, 1.1, 1.1, '#9D713F');
curve([111, 138], [120, 146], [129, 138], 2.8, '#8B4D32');
curve([61, 135], [70, 159], [92, 160], 7, '#15181C');
curve([179, 135], [170, 159], [148, 160], 7, '#15181C');
for (const shape of shapes) {
  if (shape.kind === 'ellipse') shape.center[1] += 30;
  else shape.points.forEach((point) => (point[1] += 30));
}

const directory = new URL('../public/icons/', import.meta.url);
mkdirSync(directory, { recursive: true });
const artwork = shapes
  .map((shape) => {
    if (shape.kind === 'ellipse')
      return `<ellipse cx="${shape.center[0]}" cy="${shape.center[1]}" rx="${shape.radius[0]}" ry="${shape.radius[1]}" fill="${shape.color}"/>`;
    const points = shape.points.map((point) => point.join(',')).join(' ');
    return shape.kind === 'polygon'
      ? `<polygon points="${points}" fill="${shape.color}"/>`
      : `<polyline points="${points}" fill="none" stroke="${shape.color}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  })
  .join('');
writeFileSync(
  new URL('icon.svg', directory),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="48" fill="${background}"/>${artwork}</svg>`,
);

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}
function lineDistance(x: number, y: number, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function inside(shape: Shape, x: number, y: number): boolean {
  if (shape.kind === 'ellipse')
    return (
      ((x - shape.center[0]) / shape.radius[0]) ** 2 +
        ((y - shape.center[1]) / shape.radius[1]) ** 2 <=
      1
    );
  if (shape.kind === 'line')
    return shape.points.some(
      (point, index) =>
        index > 0 && lineDistance(x, y, shape.points[index - 1], point) <= shape.width / 2,
    );
  let result = false;
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const [xi, yi] = shape.points[i],
      [xj, yj] = shape.points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}
const rgb = (hex: string): RGB =>
  [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as RGB;
const prepared = shapes.map((shape) => ({ shape, rgb: rgb(shape.color) }));
const backgroundRGB = rgb(background);
for (const size of [180, 192, 512]) {
  const pixels = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const color = [0, 0, 0];
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const px = ((x + (sx + 0.5) / 2) / size) * 240;
          const py = ((y + (sy + 0.5) / 2) / size) * 240;
          let sample = backgroundRGB;
          for (const item of prepared) if (inside(item.shape, px, py)) sample = item.rgb;
          sample.forEach((value, index) => (color[index] += value / 4));
        }
      const offset = y * (1 + size * 4) + 1 + x * 4;
      pixels.set([...color.map(Math.round), 255], offset);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    new URL(size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`, directory),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
console.info('Generated Simonchichi app icons: SVG, 180px, 192px and 512px PNG.');
