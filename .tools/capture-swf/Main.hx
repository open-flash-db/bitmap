package;

import flash.display.BitmapData;
import flash.net.URLLoader;
import flash.net.URLRequest;
import flash.net.URLRequestHeader;
import flash.net.URLRequestMethod;
import flash.utils.ByteArray;

class Main {
  public static function main(): Void {
    var width: Int = flash.Lib.current.stage.stageWidth;
    var height: Int = flash.Lib.current.stage.stageHeight;
    var bitmap: BitmapData = new BitmapData(width, height, true, 0x00000000);
    bitmap.draw(flash.Lib.current.stage);
    var bytes: ByteArray = new ByteArray();
    bitmap.copyPixelsToByteArray(bitmap.rect, bytes);
    var widthStr: String = Std.string(bitmap.width);
    var heightStr: String = Std.string(bitmap.height);
    var url: String = "http://localhost:3000/capture?width=" + widthStr + "&height=" + heightStr;
    var request: URLRequest = new URLRequest(url);
    request.method = URLRequestMethod.POST;
    request.requestHeaders.push(new URLRequestHeader("Content-type", "application/octet-stream"));
    request.data = bytes;
    var loader: URLLoader = new URLLoader();
    loader.addEventListener("complete", function(ev: Dynamic) {
      flash.Lib.fscommand("quit");
    });
    loader.load(request);
  }
}
