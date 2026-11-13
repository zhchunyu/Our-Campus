import { useEffect, useRef } from 'react'
import { CANVAS_SIZE, STROKE_FLUSH_MS } from './drawGame.js'

const SCALE = CANVAS_SIZE / 1000

function toCanvas([x, y]) {
  return [x * SCALE, y * SCALE]
}

function paintStroke(ctx, stroke) {
  const points = stroke?.pts ?? []
  if (points.length < 1) return
  ctx.strokeStyle = stroke.c
  ctx.fillStyle = stroke.c
  ctx.lineWidth = stroke.w
  ctx.beginPath()
  const [firstX, firstY] = toCanvas(points[0])
  if (points.length === 1) {
    ctx.arc(firstX, firstY, stroke.w / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.moveTo(firstX, firstY)
  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = toCanvas(points[index])
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// 画布只负责「画」和「显示」：本地笔画即时上屏，累积 110ms 再发一批；
// 远端笔画由父组件按数组增量下发，重连或换局时数组变短会自动整幅重绘。
export function DrawCanvas({ strokes = [], drawing = false, onStroke, color = '#2f3b32', width = 7, className = '' }) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const drawnRef = useRef(0)
  const bufferRef = useRef([])
  const activeRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
  }, [])

  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    if (strokes.length < drawnRef.current) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      drawnRef.current = 0
    }
    for (let index = drawnRef.current; index < strokes.length; index += 1) paintStroke(ctx, strokes[index])
    drawnRef.current = strokes.length
  }, [strokes])

  useEffect(() => {
    if (!drawing) return undefined
    const timer = setInterval(() => {
      const buffer = bufferRef.current
      if (buffer.length < 2) return
      onStroke?.({ c: color, w: width, pts: buffer.map(([x, y]) => [x, y]) })
      bufferRef.current = [buffer[buffer.length - 1]]
    }, STROKE_FLUSH_MS)
    return () => clearInterval(timer)
  }, [color, drawing, onStroke, width])

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1000
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 1000
    return [Math.min(1000, Math.max(0, x)), Math.min(1000, Math.max(0, y))]
  }

  const handlePointerDown = (event) => {
    if (!drawing) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    activeRef.current = true
    const point = pointFromEvent(event)
    bufferRef.current = [point]
    const ctx = ctxRef.current
    if (!ctx) return
    const [x, y] = toCanvas(point)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, width / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  const handlePointerMove = (event) => {
    if (!drawing || !activeRef.current) return
    const point = pointFromEvent(event)
    const buffer = bufferRef.current
    const previous = buffer[buffer.length - 1]
    if (!previous) return
    const ctx = ctxRef.current
    if (ctx) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      const [fromX, fromY] = toCanvas(previous)
      const [toX, toY] = toCanvas(point)
      ctx.moveTo(fromX, fromY)
      ctx.lineTo(toX, toY)
      ctx.stroke()
    }
    buffer.push(point)
  }

  const finishStroke = () => {
    if (!activeRef.current) return
    activeRef.current = false
    const buffer = bufferRef.current
    if (buffer.length >= 2) onStroke?.({ c: color, w: width, pts: buffer.map(([x, y]) => [x, y]) })
    bufferRef.current = []
  }

  return (
    <canvas
      ref={canvasRef}
      className={`draw-game__canvas ${className}`.trim()}
      style={{ touchAction: 'none', cursor: drawing ? 'crosshair' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onPointerLeave={finishStroke}
      aria-label={drawing ? '画布：按住并拖动来画' : '画布：观战'}
      role="img"
    />
  )
}
