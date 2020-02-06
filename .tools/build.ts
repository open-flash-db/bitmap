import sysPath from "path";
import fs from "fs";
import meta from "./meta";
import { JsonReader } from "kryo/readers/json";
import { $DefineBitmap, DefineBitmap } from "swf-types/tags/define-bitmap";
import { JsonValueWriter } from "kryo/writers/json-value";
import { capture, createCaptureSwf } from "./capture";
import * as canvas from "canvas";

const JSON_READER: JsonReader = new JsonReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

const PROJECT_ROOT = sysPath.join(meta.dirname, "..");
const EMPTY_BUFFER: Buffer = Buffer.alloc(0);

const WHITELIST: ReadonlySet<string> = new Set([]);

export async function cleanBuild(): Promise<void> {
  await clean();
  return build();
}

export async function build(): Promise<void> {
  const testItems: TestItem[] = await getTestItems();

  async function buildTagItems() {
    for (const item of testItems) {
      if (item.src === undefined || item.src.type !== "tag") {
        continue;
      }
      const inputStr: string = fs.readFileSync(item.src.path, {encoding: "UTF-8"});
      const inputTag: DefineBitmap = $DefineBitmap.read(JSON_READER, inputStr);
      const tag: DefineBitmap = {...inputTag, id: 1};
      fs.writeFileSync(
        item.tagPath,
        `${JSON.stringify($DefineBitmap.write(JSON_VALUE_WRITER, tag), null, 2)}\n`,
        {encoding: "UTF-8"},
      );
    }
  }

  await buildTagItems();

  for (const item of testItems) {
    const tagJson: string = fs.readFileSync(item.tagPath, {encoding: "UTF-8"});
    const tag: DefineBitmap = $DefineBitmap.read(JSON_READER, tagJson);
    const captureSwf: Uint8Array = await createCaptureSwf(tag);
    fs.writeFileSync(item.captureSwfPath, captureSwf);
    const data: canvas.ImageData = await capture(item.captureSwfPath);
    const cvs: canvas.Canvas = canvas.createCanvas(data.width, data.height);
    const cx: canvas.CanvasRenderingContext2D = cvs.getContext("2d");
    cx.putImageData(data, 0, 0);
    const pngBuffer: Uint8Array = cvs.toBuffer("image/png");
    fs.writeFileSync(item.expectedPng, pngBuffer);
    fs.writeFileSync(item.bitmapPath, tag.data);
  }
}

export async function clean(): Promise<void> {
  console.warn("TODO: Implement `clean` function");
}

interface TestItem {
  name: string;
  root: string;
  type: string;
  bitmapPath: string;
  captureSwfPath: string;
  tagPath: string;
  expectedPng: string;
  src?: TestItemSource;
}

type TestItemSource = TagSource;

interface TagSource {
  type: "tag";
  path: string;
}

async function getTestItems(): Promise<TestItem[]> {
  const items: TestItem[] = [];
  for (const dirEnt of await readdirAsync(PROJECT_ROOT)) {
    if (!dirEnt.isDirectory() || dirEnt.name.startsWith(".") || dirEnt.name === "node_modules") {
      continue;
    }
    const groupName = dirEnt.name;
    const groupPath = sysPath.join(PROJECT_ROOT, groupName);
    for (const dirEnt of await readdirAsync(groupPath)) {
      if (!dirEnt.isDirectory()) {
        continue;
      }
      const name = dirEnt.name;

      const fullName: string = `${groupName}/${name}`;
      if (WHITELIST.size > 0 && !WHITELIST.has(fullName)) {
        continue;
      }

      const root = sysPath.join(groupPath, name);
      const captureSwfPath = sysPath.join(root, "capture.swf");
      const bitmapPath = sysPath.join(root, `bitmap.${groupName}`);
      const tagPath = sysPath.join(root, "tag.json");
      const expectedPng = sysPath.join(root, "expected.png");
      const src = getItemSourceSync(root);
      const item: TestItem = {name, root, type: "image/x-swf-bitmap", bitmapPath, captureSwfPath, tagPath, expectedPng, src};
      items.push(item);
    }
  }
  return items;
}

function getItemSourceSync(itemRoot: string): TestItemSource | undefined {
  const srcDir = sysPath.join(itemRoot, "src");
  const tagPath = sysPath.join(srcDir, "tag.json");
  if (fs.existsSync(tagPath)) {
    return {type: "tag", path: tagPath};
  } else {
    return undefined;
  }
}

async function readdirAsync(dir: fs.PathLike): Promise<fs.Dirent[]> {
  return new Promise<fs.Dirent[]>((resolve, reject): void => {
    fs.readdir(dir, {withFileTypes: true}, (err, files) => {
      if (err !== null) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}

cleanBuild();
