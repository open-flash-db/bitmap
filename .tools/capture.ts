import Koa from "koa";
import { Server } from "http";
import { DefineBitmap, DefineShape, DoAbc, FileAttributes, PlaceObject, ShowFrame, SymbolClass } from "swf-types/tags";
import sysPath from "path";
import meta from "./meta";
import * as fs from "fs";
import { CompressionMethod, FillStyleType, Header, Movie, ShapeRecordType, TagType, Ufixed8P8 } from "swf-types";
import { parseSwf } from "swf-parser";
import { emitSwf } from "swf-emitter";
import { Sfixed16P16 } from "swf-types/fixed-point/sfixed16p16";
import rawBody from "raw-body";
import * as canvas from "canvas";
import { Observable, Subscriber } from "rxjs";
import { runSwf } from "./run";

const CAPTURE_PORT: number = 3000;
const BASE_CAPTURE_SWF: string = sysPath.join(meta.dirname, "capture-swf", "capture.swf");

const CROSSDOMAIN_XML: string = `<?xml version="1.0"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.adobe.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" />
  <site-control permitted-cross-domain-policies="all" />
</cross-domain-policy>
`;

export async function createCaptureSwf(tag: DefineBitmap): Promise<Uint8Array> {
  const attributes: FileAttributes = {
    type: TagType.FileAttributes,
    useNetwork: true,
    useRelativeUrls: false,
    noCrossDomainCaching: false,
    useAs3: true,
    hasMetadata: false,
    useGpu: false,
    useDirectBlit: false,
  };
  const bitmap: DefineBitmap = {...tag, id: 1};
  const shape: DefineShape = {
    type: TagType.DefineShape,
    id: 2,
    bounds: {xMin: 0, xMax: bitmap.width * 20, yMin: 0, yMax: bitmap.height * 20},
    edgeBounds: undefined,
    hasFillWinding: false,
    hasNonScalingStrokes: false,
    hasScalingStrokes: false,
    shape: {
      initialStyles: {
        fill: [
          {
            type: FillStyleType.Bitmap,
            bitmapId: 1,
            matrix: {
              scaleX: Sfixed16P16.fromValue(20),
              scaleY: Sfixed16P16.fromValue(20),
              rotateSkew0: Sfixed16P16.fromValue(0),
              rotateSkew1: Sfixed16P16.fromValue(0),
              translateX: 0,
              translateY: 0,
            },
            repeating: false,
            smoothed: false,
          },
        ],
        line: [],
      },
      records: [
        {type: ShapeRecordType.StyleChange, rightFill: 1},
        {type: ShapeRecordType.Edge, delta: {x: bitmap.width * 20, y: 0}},
        {type: ShapeRecordType.Edge, delta: {x: 0, y: bitmap.height * 20}},
        {type: ShapeRecordType.Edge, delta: {x: -bitmap.width * 20, y: 0}},
        {type: ShapeRecordType.Edge, delta: {x: 0, y: -bitmap.height * 20}},
      ],
    },
  };
  const place: PlaceObject = {
    type: TagType.PlaceObject,
    isUpdate: false,
    characterId: 2,
    depth: 1,
  };
  const abc: DoAbc = await getCaptureAbc();
  const symbol: SymbolClass = {
    type: TagType.SymbolClass,
    symbols: [
      {id: 0, name: "boot_ef59"},
    ],
  };
  const show: ShowFrame = {type: TagType.ShowFrame};
  const header: Header = {
    frameCount: 1,
    frameSize: {xMin: 0, xMax: bitmap.width * 20, yMin: 0, yMax: bitmap.height * 20},
    frameRate: Ufixed8P8.fromValue(30),
    swfVersion: 17,
  };
  const movie: Movie = {
    header,
    tags: [
      attributes,
      bitmap,
      shape,
      place,
      abc,
      symbol,
      show,
    ],
  };
  return emitSwf(movie, CompressionMethod.None);
}

async function getCaptureAbc(): Promise<DoAbc> {
  const base: Movie = await readSwf(BASE_CAPTURE_SWF);
  for (const tag of base.tags) {
    if (tag.type === TagType.DoAbc) {
      return tag;
    }
  }
  throw new Error("DoAbcTagNotFound");
}

export async function capture(path: string, withLogs: boolean = false): Promise<canvas.ImageData> {
  return new Promise((resolve, reject) => {
    let isServerStarted: boolean = false;
    const app: Koa = new Koa();

    if (withLogs) {
      app.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
      });
    }

    app.use(async (ctx) => {
      if (ctx.url === "/crossdomain.xml") {
        ctx.body = CROSSDOMAIN_XML;
        ctx.type = "application/xml";
        ctx.status = 200;
      } else if (ctx.method === "POST") {
        try {
          const data = await decodeFlashBitmap(ctx);
          completeOk(data);
          ctx.status = 200;
        } catch (err) {
          console.error(err);
          ctx.status = 500;
        }
      } else {
        ctx.status = 404;
      }
    });

    const server: Server = app.listen(CAPTURE_PORT, async () => {
      isServerStarted = true;
      await runSwf(path);
    });

    function completeOk(data: canvas.ImageData): void {
      if (isServerStarted) {
        server.close();
      }
      resolve(data);
    }

    function completeErr(err: Error): void {
      if (isServerStarted) {
        server.close();
      }
      reject(err);
    }
  });
}

async function decodeFlashBitmap(ctx: Koa.Context): Promise<canvas.ImageData> {
  const body = await rawBody(ctx.req);
  const path = ctx.path;
  const query = ctx.query;
  const width = parseInt(query.width, 10);
  const height = parseInt(query.height, 10);
  checkParameters(path, body, width, height);
  const data: Uint8ClampedArray = argbToRgbaClamped(body);
  return canvas.createImageData(data, width, height);
}

function checkParameters(path: string, body: Uint8Array, width: number, height: number) {
  if (!isImageDimension(width)) {
    throw new Error("InvalidWidth");
  }
  if (!isImageDimension(height)) {
    throw new Error("InvalidWidth");
  }
  if (!/\/[a-z]{1,32}/.test(path)) {
    throw new Error("InvalidPath");
  }
  if (width * height * 4 !== body.length) {
    throw new Error("InvalidBody");
  }
}

function isImageDimension(value: unknown): value is number {
  return typeof value === "number" && 0 < value && value <= (1 << 16) && Math.floor(value) === value;
}

function argbToRgbaClamped(bytes: Uint8Array): Uint8ClampedArray {
  const result: Uint8ClampedArray = new Uint8ClampedArray(bytes.length);
  for (let i = 0; i < bytes.length; i += 4) {
    result[i] = bytes[i + 1];
    result[i + 1] = bytes[i + 2];
    result[i + 2] = bytes[i + 3];
    result[i + 3] = bytes[i];
  }
  return result;
}

async function readSwf(path: fs.PathLike): Promise<Movie> {
  const bytes: Uint8Array = await readFile(path);
  return parseSwf(bytes);
}

async function readFile(path: fs.PathLike): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, {encoding: null}, ((err: Error | null, data: Uint8Array): void => {
      if (err !== null) {
        reject(err);
      } else {
        resolve(data);
      }
    }));
  });
}
