export const calibrationMath = {
    distance(points, spacing) {
      if (!points || points.length !== 2) return null;
      const [a, b] = points;
      if (![...a, ...b].every(Number.isFinite)) return null;
      if (spacing && (![spacing.row_mm, spacing.column_mm].every(Number.isFinite)
        || spacing.row_mm <= 0 || spacing.column_mm <= 0)) return null;
      return Math.hypot((b[0] - a[0]) * (spacing?.column_mm ?? 1), (b[1] - a[1]) * (spacing?.row_mm ?? 1));
    },
    reference(points, value) {
      const length = calibrationMath.distance(points);
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(length) || length < 2) return null;
      return { row_mm: value / length, column_mm: value / length, source: 'manual_reference' };
    },
  };
