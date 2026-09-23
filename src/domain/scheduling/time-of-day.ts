/** Minutos desde 00:00 ↔ valor de `<input type="time">` ("HH:MM"). */
export function toTimeInput(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** "HH:MM" → minutos desde 00:00; valor vazio ou inválido vira 0. */
export function fromTimeInput(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
