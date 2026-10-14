param(
  [string]$PrinterName = "BIXOLON SRP-E302",
  [int]$Port = 18181,
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if ([string]::IsNullOrWhiteSpace($Token)) {
  $projectDirectory = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { (Get-Location).Path }
  $environmentFile = Join-Path $projectDirectory ".env"
  if (Test-Path $environmentFile) {
    $tokenLine = Get-Content -Encoding UTF8 $environmentFile | Where-Object { $_ -match '^RECEIPT_PRINTER_TOKEN=' } | Select-Object -First 1
    if ($tokenLine) { $Token = $tokenLine.Substring($tokenLine.IndexOf('=') + 1).Trim() }
  }
}
if ([string]::IsNullOrWhiteSpace($Token)) { throw "RECEIPT_PRINTER_TOKEN is not configured" }

function Money($value) { ([double]$value).ToString("N2", [Globalization.CultureInfo]::GetCultureInfo("th-TH")) }
function Value($object, [string]$name, $fallback = $null) {
  if ($null -eq $object) { return $fallback }
  $property = $object.PSObject.Properties[$name]
  if ($null -eq $property -or $null -eq $property.Value) { return $fallback }
  $property.Value
}

function Print-Receipt($payload) {
  $settings = [Drawing.Printing.PrinterSettings]::new()
  $settings.PrinterName = $PrinterName
  if (-not $settings.IsValid) { throw "ไม่พบเครื่องพิมพ์ $PrinterName ใน Windows" }
  $sale = Value $payload "sale"
  if ($null -eq $sale) { throw "ไม่พบข้อมูลใบเสร็จ" }
  $shop = Value $payload "shop"
  $items = @(Value $sale "items" @())
  $payments = @(Value $sale "payments" @())

  $doc = [Drawing.Printing.PrintDocument]::new()
  $doc.PrinterSettings.PrinterName = $PrinterName
  $doc.PrintController = [Drawing.Printing.StandardPrintController]::new()
  $doc.DocumentName = "UP Minimart Receipt " + [string](Value $sale "invoiceNo" (Value $sale "id" "TEST"))
  $doc.DefaultPageSettings.Margins = [Drawing.Printing.Margins]::new(4, 4, 4, 4)
  $height = [Math]::Min(3200, [Math]::Max(700, 560 + 62 * $items.Count + 32 * $payments.Count))
  $doc.DefaultPageSettings.PaperSize = [Drawing.Printing.PaperSize]::new("Receipt 80mm", 315, $height)

  $font = [Drawing.Font]::new("Tahoma", 8.3)
  $small = [Drawing.Font]::new("Tahoma", 7.2)
  $bold = [Drawing.Font]::new("Tahoma", 8.3, [Drawing.FontStyle]::Bold)
  $title = [Drawing.Font]::new("Tahoma", 12, [Drawing.FontStyle]::Bold)
  $totalFont = [Drawing.Font]::new("Tahoma", 11, [Drawing.FontStyle]::Bold)
  $pen = [Drawing.Pen]::new([Drawing.Color]::Black, 2)

  $doc.add_PrintPage({
    param($sender, $eventArgs)
    # Rasterize the complete receipt first. This prevents the BIXOLON driver from
    # substituting its resident fonts, which do not contain all Thai glyphs.
    $printerGraphics = $eventArgs.Graphics
    $bitmapHeight = [Math]::Min(18000, [Math]::Max(1800, 900 + 90 * $items.Count + 50 * $payments.Count))
    $bitmap = [Drawing.Bitmap]::new(520, $bitmapHeight, [Drawing.Imaging.PixelFormat]::Format32bppPArgb)
    $bitmap.SetResolution(203, 203)
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.PageUnit = [Drawing.GraphicsUnit]::Pixel
    $g.Clear([Drawing.Color]::White)
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $left = [single]12
    $width = [single]496
    $right = $left + $width
    $script:receiptY = [single]12
    function Center([string]$text, $useFont, [single]$gap = 2) {
      if ([string]::IsNullOrWhiteSpace($text)) { return }
      $format = [Drawing.StringFormat]::new(); $format.Alignment = [Drawing.StringAlignment]::Center
      $size = $g.MeasureString($text, $useFont, [int]$width)
      $g.DrawString($text, $useFont, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new($left, $script:receiptY, $width, $size.Height + 2), $format)
      $script:receiptY += [Math]::Ceiling($size.Height) + $gap; $format.Dispose()
    }
    function Wrapped([string]$text, $useFont, [single]$gap = 1) {
      if ([string]::IsNullOrWhiteSpace($text)) { return }
      $size = $g.MeasureString($text, $useFont, [int]$width)
      $g.DrawString($text, $useFont, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new($left, $script:receiptY, $width, $size.Height + 3))
      $script:receiptY += [Math]::Ceiling($size.Height) + $gap
    }
    function Pair([string]$label, [string]$text, $useFont = $font, [single]$gap = 2) {
      $format = [Drawing.StringFormat]::new(); $format.Alignment = [Drawing.StringAlignment]::Far
      $measuredValueWidth = $g.MeasureString($text, $useFont).Width + 10
      $valueWidth = [single][Math]::Min($width * .64, [Math]::Max($width * .38, $measuredValueWidth))
      $labelWidth = [single]($width - $valueWidth)
      $labelSize = $g.MeasureString($label, $useFont, [int]$labelWidth)
      $valueSize = $g.MeasureString($text, $useFont, [int]$valueWidth)
      $lineHeight = [Math]::Max($labelSize.Height, $valueSize.Height)
      $g.DrawString($label, $useFont, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new($left, $script:receiptY, $labelWidth, $lineHeight + 6))
      $g.DrawString($text, $useFont, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new($left + $labelWidth, $script:receiptY, $valueWidth, $lineHeight + 6), $format)
      $script:receiptY += [Math]::Ceiling($lineHeight) + $gap + 3; $format.Dispose()
    }
    function Rule { $script:receiptY += 2; $g.DrawLine($pen, $left, $script:receiptY, $right, $script:receiptY); $script:receiptY += 4 }
    function ItemRow([string]$name, [string]$quantity, [string]$price, [string]$total) {
      # Fixed columns keep every item on one line; long names use an ellipsis.
      $lineHeight = [single][Math]::Ceiling($font.GetHeight($g) + 5)
      $columnWidths = @(220, 76, 100, 100)
      $values = @($name, $quantity, $price, $total)
      $columnLeft = $left
      for ($column = 0; $column -lt 4; $column++) {
        $format = [Drawing.StringFormat]::new()
        $format.FormatFlags = [Drawing.StringFormatFlags]::NoWrap
        $format.Trimming = if ($column -eq 0) { [Drawing.StringTrimming]::EllipsisCharacter } else { [Drawing.StringTrimming]::None }
        $format.Alignment = if ($column -eq 0) { [Drawing.StringAlignment]::Near } else { [Drawing.StringAlignment]::Far }
        $cellFont = $small
        if ($column -gt 0) {
          $cellSize = $small.Size
          while ($g.MeasureString($values[$column], $cellFont).Width -gt $columnWidths[$column] - 4 -and $cellSize -gt 1) {
            if ($cellFont -ne $small) { $cellFont.Dispose() }
            $cellSize -= .2
            $cellFont = [Drawing.Font]::new("Tahoma", $cellSize)
          }
        }
        $g.DrawString($values[$column], $cellFont, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new($columnLeft, $script:receiptY, $columnWidths[$column] - 4, $lineHeight), $format)
        if ($cellFont -ne $small) { $cellFont.Dispose() }
        $format.Dispose()
        $columnLeft += $columnWidths[$column]
      }
      $script:receiptY += $lineHeight
    }

    Center ([string](Value $shop "name" "UP Minimart")) $title
    Center (([string](Value $shop "address1" "") + " " + [string](Value $shop "address2" "")).Trim()) $small 1
    $phone = [string](Value $shop "phone" ""); if ($phone) { Center ("โทร. " + $phone) $small 1 }
    $taxId = [string](Value $shop "taxId" ""); if ($taxId) { Center ("เลขประจำตัวผู้เสียภาษี " + $taxId) $small 1 }
    Center "ใบเสร็จรับเงิน" $bold 3; Rule
    Pair "เลขที่บิล" ([string](Value $sale "invoiceNo" (Value $sale "id" "-")))
    $dateText = [string](Value $sale "soldAt" "-")
    try { $dateText = ([DateTimeOffset]::Parse($dateText)).ToOffset([TimeSpan]::FromHours(7)).ToString("dd/MM/yyyy HH:mm") } catch {}
    Pair "วันที่" $dateText $small 3
    Pair "ลูกค้า" ([string](Value (Value $sale "customer") "name" "ลูกค้าทั่วไป"))
    Pair "พนักงาน" ([string](Value $sale "soldBy" "-")); Rule
    ItemRow "สินค้า" "จำนวน" "ราคา" "รวม"
    foreach ($item in $items) {
      ItemRow ([string](Value $item "name" "สินค้า")) ("{0} {1}" -f (Value $item "quantity" 0), (Value $item "unit" "ชิ้น")) (Money (Value $item "unitPrice" 0)) (Money (Value $item "lineTotal" 0))
    }
    Rule
    Pair "ยอดก่อนส่วนลด" (Money (Value $sale "subtotal" 0))
    $discount = [double](Value $sale "discountAmount" 0); if ($discount -gt 0) { Pair "ส่วนลด" ("-" + (Money $discount)) }
    Pair "ภาษีมูลค่าเพิ่ม (รวมในราคา)" (Money (Value $sale "vatAmount" 0)) $small
    Pair "ยอดชำระ" ("฿" + (Money (Value $sale "total" 0))) $totalFont 4
    $labels = @{ C = "เงินสด"; T = "QR / โอน"; D = "บัตร/โครงการรัฐ"; M = "หลายช่องทาง" }
    $paymentType = [string](Value $sale "paymentType" ""); Pair "วิธีชำระ" $(if ($labels[$paymentType]) { $labels[$paymentType] } else { "ไม่ระบุ" })
    foreach ($payment in $payments) {
      $methods = @{ cash = "เงินสด"; transfer = "QR / โอน"; card = "บัตร/โครงการรัฐ"; unknown = "ไม่ระบุ" }
      $method = [string](Value $payment "method" "unknown")
      Pair $(if ($methods[$method]) { $methods[$method] } else { $method }) ("฿" + (Money (Value $payment "amount" 0))) $small 1
      if ($method -eq "cash" -and $null -ne (Value $payment "receivedAmount")) { Pair "รับมา / เงินทอน" ((Money (Value $payment "receivedAmount" 0)) + " / " + (Money (Value $payment "changeAmount" 0))) $small 1 }
    }
    if ([bool](Value $sale "cancelled" $false)) { Rule; Center "*** ยกเลิกแล้ว ***" $bold; Wrapped ("เหตุผล: " + [string](Value $sale "cancelReason" "ไม่ระบุ")) $small }
    Rule; Center "ขอบคุณที่ใช้บริการ" $font 4; Center "UP Minimart POS" $small
    $usedHeight = [Math]::Min($bitmapHeight, [Math]::Ceiling($script:receiptY + 12))
    $targetWidth = [int][Math]::Min(260, $eventArgs.MarginBounds.Width)
    $targetHeight = [int][Math]::Ceiling($usedHeight * $targetWidth / 520)
    # Move the 66 mm print area 5 mm left from its centered position.
    $targetLeft = [int][Math]::Max($eventArgs.MarginBounds.Left, [Math]::Round($eventArgs.MarginBounds.Left + (($eventArgs.MarginBounds.Width - $targetWidth) / 2)) - 20)
    $targetTop = [int]$eventArgs.MarginBounds.Top
    $printerGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $printerGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::Half
    $printerGraphics.DrawImage($bitmap, [Drawing.Rectangle]::new($targetLeft, $targetTop, $targetWidth, $targetHeight), 0, 0, 520, $usedHeight, [Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $bitmap.Dispose()
    $eventArgs.HasMorePages = $false
  })
  try { $doc.Print() } finally { $doc.Dispose(); $font.Dispose(); $small.Dispose(); $bold.Dispose(); $title.Dispose(); $totalFont.Dispose(); $pen.Dispose() }
  $doc.DocumentName
}

function Cors([string]$origin) {
  if ($origin -match '^https?://(localhost|127\.0\.0\.1)(:\d+)?$') { return $origin }
  ""
}
function Reply($context, [int]$status, $body) {
  $json = if ($null -eq $body) { "" } else { $body | ConvertTo-Json -Compress -Depth 8 }
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode = $status
  $context.Response.ContentType = "application/json; charset=utf-8"
  $origin = Cors $context.Request.Headers["Origin"]
  if ($origin) {
    $context.Response.Headers["Access-Control-Allow-Origin"] = $origin
    $context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    $context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
    $context.Response.Headers["Access-Control-Allow-Private-Network"] = "true"
    $context.Response.Headers["Vary"] = "Origin"
  }
  $context.Response.ContentLength64 = $bytes.Length
  if ($bytes.Length) { $context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
  $context.Response.Close()
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Receipt printer agent: http://127.0.0.1:$Port -> $PrinterName"
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $origin = $context.Request.Headers["Origin"]
      if ($origin -and -not (Cors $origin)) { Reply $context 403 @{ ok = $false; message = "ไม่อนุญาต origin นี้" }; continue }
      if ($context.Request.HttpMethod -eq "OPTIONS") { Reply $context 204 $null; continue }
      if ($context.Request.Headers["Authorization"] -cne "Bearer $Token") { Reply $context 403 @{ ok = $false; message = "ไม่ได้รับอนุญาตให้สั่งพิมพ์" }; continue }
      if ($context.Request.HttpMethod -eq "GET" -and $context.Request.Url.AbsolutePath -eq "/status") {
        $settings = [Drawing.Printing.PrinterSettings]::new(); $settings.PrinterName = $PrinterName
        Reply $context 200 @{ ok = $settings.IsValid; printer = $PrinterName; port = $Port }; continue
      }
      if ($context.Request.HttpMethod -eq "POST" -and $context.Request.Url.AbsolutePath -eq "/print") {
        $reader = [IO.StreamReader]::new($context.Request.InputStream, [Text.Encoding]::UTF8, $true)
        try { $payload = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        $job = Print-Receipt $payload
        Reply $context 200 @{ ok = $true; printer = $PrinterName; job = $job }; continue
      }
      Reply $context 404 @{ ok = $false; message = "ไม่พบ endpoint" }
    } catch { try { Reply $context 500 @{ ok = $false; message = $_.Exception.Message } } catch {} }
  }
} finally { $listener.Stop(); $listener.Close() }
