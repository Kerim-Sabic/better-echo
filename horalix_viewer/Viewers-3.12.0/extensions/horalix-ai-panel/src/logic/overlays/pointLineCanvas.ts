export type CanvasPoint = {
  id?: string | null;
  x: number;
  y: number;
};

export type CanvasSegment = {
  from: CanvasPoint;
  to: CanvasPoint;
  role?: string | null;
};

export type CanvasLine = {
  from: CanvasPoint;
  to: CanvasPoint;
};

export type PointLineDrawPayload = {
  color: string;
  opacity: number;
  points: CanvasPoint[];
  segments: CanvasSegment[];
  referenceLine?: CanvasLine | null;
  label?: string | null;
  labelAnchor?: CanvasPoint | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function drawPoint(ctx: CanvasRenderingContext2D, point: CanvasPoint, color: string) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#050910';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  anchor: CanvasPoint,
  color: string
) {
  const paddingX = 6;
  const paddingY = 4;
  const x = anchor.x + 8;
  const y = anchor.y - 20;

  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 18;

  ctx.fillStyle = 'rgba(5, 9, 16, 0.88)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + boxWidth - 4, y);
  ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + 4);
  ctx.lineTo(x + boxWidth, y + boxHeight - 4);
  ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - 4, y + boxHeight);
  ctx.lineTo(x + 4, y + boxHeight);
  ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - 4);
  ctx.lineTo(x, y + 4);
  ctx.quadraticCurveTo(x, y, x + 4, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, x + paddingX, y + boxHeight - paddingY - 1);
}

export function drawPointLineOverlay(
  ctx: CanvasRenderingContext2D,
  payload: PointLineDrawPayload
) {
  const opacity = clamp(payload.opacity, 0, 1);
  if (opacity <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (payload.referenceLine) {
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FBBF24';
    ctx.beginPath();
    ctx.moveTo(payload.referenceLine.from.x, payload.referenceLine.from.y);
    ctx.lineTo(payload.referenceLine.to.x, payload.referenceLine.to.y);
    ctx.stroke();
    ctx.restore();
  }

  payload.segments.forEach(segment => {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = payload.color;
    ctx.beginPath();
    ctx.moveTo(segment.from.x, segment.from.y);
    ctx.lineTo(segment.to.x, segment.to.y);
    ctx.stroke();
  });

  payload.points.forEach(point => drawPoint(ctx, point, payload.color));

  if (payload.label && payload.labelAnchor) {
    drawLabel(ctx, payload.label, payload.labelAnchor, payload.color);
  }

  ctx.restore();
}
