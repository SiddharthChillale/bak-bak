// Render the extension icons from public/logo.svg (macOS 13+, which reads SVG natively).
//
//     swift scripts/make-icons.swift      # writes public/icon/{16,32,48,96,128}.png
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let logo = NSImage(contentsOf: root.appendingPathComponent("public/logo.svg"))!
let out = root.appendingPathComponent("public/icon")

for size in [16, 32, 48, 96, 128] {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  logo.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent("\(size).png"))
}
print("wrote icons to \(out.path)")
