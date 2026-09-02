Add-Type -AssemblyName System.Drawing

function New-AppIcon([int]$Size, [string]$Path) {
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $scale = $Size / 64.0
  $graphics.Clear([System.Drawing.Color]::FromArgb(122, 92, 142))

  $paper = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 253, 248))
  $receipt = New-Object System.Drawing.Drawing2D.GraphicsPath
  $receipt.AddPolygon([System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(18*$scale,13*$scale), [System.Drawing.PointF]::new(46*$scale,13*$scale),
    [System.Drawing.PointF]::new(46*$scale,53*$scale), [System.Drawing.PointF]::new(41*$scale,50*$scale),
    [System.Drawing.PointF]::new(36.5*$scale,53*$scale), [System.Drawing.PointF]::new(32*$scale,50*$scale),
    [System.Drawing.PointF]::new(27.5*$scale,53*$scale), [System.Drawing.PointF]::new(23*$scale,50*$scale),
    [System.Drawing.PointF]::new(18*$scale,53*$scale)
  ))
  $graphics.FillPath($paper, $receipt)

  $purplePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(122,92,142), (4*$scale))
  $purplePen.StartCap = $purplePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  foreach ($line in @(@(24,23,40,23),@(24,31,40,31),@(24,39,33,39))) {
    $graphics.DrawLine($purplePen,$line[0]*$scale,$line[1]*$scale,$line[2]*$scale,$line[3]*$scale)
  }
  $coral = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(213,71,107))
  $graphics.FillEllipse($coral,35*$scale,34*$scale,12*$scale,12*$scale)
  $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, (2*$scale))
  $whitePen.StartCap = $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($whitePen,41*$scale,36.5*$scale,41*$scale,43.5*$scale)
  $graphics.DrawLine($whitePen,38.5*$scale,39*$scale,43.5*$scale,39*$scale)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $whitePen.Dispose(); $coral.Dispose(); $purplePen.Dispose(); $receipt.Dispose(); $paper.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

$publicPath = Join-Path $PSScriptRoot '..\public'
New-AppIcon 180 (Join-Path $publicPath 'apple-touch-icon.png')
New-AppIcon 192 (Join-Path $publicPath 'icon-192.png')
New-AppIcon 512 (Join-Path $publicPath 'icon-512.png')
