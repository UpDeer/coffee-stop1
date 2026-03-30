/**
 * Приводит распространённые ссылки Google Диска к виду, пригодному для <img src>.
 * Файл должен быть доступен по ссылке («Все, у кого есть ссылка»).
 */
export function normalizeExternalImageUrl(url: string | null | undefined): string | null {
  if (url == null || url.trim() === "") return null;
  const trimmed = url.trim();

  const fromFilePath = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)(?:\/|$|\?)/);
  if (fromFilePath) {
    return `https://drive.google.com/uc?export=view&id=${fromFilePath[1]}`;
  }

  if (/drive\.google\.com/.test(trimmed)) {
    const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParam) {
      return `https://drive.google.com/uc?export=view&id=${idParam[1]}`;
    }
  }

  return trimmed;
}
