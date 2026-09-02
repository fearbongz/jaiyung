Add-Type -AssemblyName System.Drawing

function New-AppIcon([int]$Size, [string]$Path) {
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $scale = $Size / 64.0
  $graphics.Clear([System.Drawing.Color]::FromArgb(213, 71, 107))
  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 253, 248))
  $graphics.FillEllipse($cream, 9*$scale, 9*$scale, 46*$scale, 46*$scale)
  $coral = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(213,71,107))
  $font = New-Object System.Drawing.Font('Tahoma', (31*$scale), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('B', $font, $coral, [System.Drawing.RectangleF]::new(8*$scale,7*$scale,48*$scale,49*$scale), $format)
  $barPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(213,71,107), (3*$scale))
  $barPen.StartCap = $barPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($barPen,28*$scale,17*$scale,28*$scale,47*$scale)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $barPen.Dispose(); $format.Dispose(); $font.Dispose(); $coral.Dispose(); $cream.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

$publicPath = Join-Path $PSScriptRoot '..\public'
New-AppIcon 180 (Join-Path $publicPath 'jaiyung-icon-180-v2.png')
New-AppIcon 192 (Join-Path $publicPath 'jaiyung-icon-192-v2.png')
New-AppIcon 512 (Join-Path $publicPath 'jaiyung-icon-512-v2.png')
