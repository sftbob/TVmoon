export function getVideoTransferInfo(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const path = url.pathname.toLowerCase();
    return {
      url: url.href,
      isFile: /\.(mp4|webm|m4v|mov)$/.test(path),
    };
  } catch {
    return null;
  }
}
