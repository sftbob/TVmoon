// Website-side ES module. Prepare media URLs BEFORE enabling the send button.
const CHANNEL = "tianding.tvmoon.v1";
const LIMIT = 50;

function exchange(payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
    const receive = (event) => {
      if (event.source !== window || event.origin !== location.origin ||
          event.data?.channel !== CHANNEL || event.data?.type !== "response") return;
      const response = event.data.payload;
      if (response?.version !== 1 || response.requestId !== payload.requestId) return;
      finish(); resolve(response);
    };
    const timer = setTimeout(() => { finish(); reject(new Error("HANDOFF_TIMEOUT")); }, timeoutMs);
    window.addEventListener("message", receive);
    window.postMessage({ channel: CHANNEL, type: "request", payload }, location.origin);
  });
}

export function probeExtension() {
  // Availability means the extension replied; it does not verify desktop setup.
  return exchange({ version: 1, requestId: crypto.randomUUID(), action: "probe" }, 2000);
}

export async function prepareTvmoonItems(downloadItems, sourcePageUrl) {
  if (!Array.isArray(downloadItems) || !downloadItems.length || downloadItems.length > LIMIT)
    throw new Error("BATCH_TOO_LARGE");
  return Promise.all(downloadItems.map(async (item) => {
    // PR #6: {id,title,episode,url}. Some ids exceed the contract's 128 chars.
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(item.id));
    const clientItemId = "tvmoon-" + Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, "0")).join("");
    return { clientItemId, title: item.title, episode: item.episode, mediaUrl: item.url,
      ...(sourcePageUrl ? { sourcePageUrl } : {}) };
  }));
}

export function makeBatch(items, startAfterEnqueue = true) {
  if (!Array.isArray(items) || !items.length || items.length > LIMIT) throw new Error("BATCH_TOO_LARGE");
  return { version: 1, requestId: crypto.randomUUID(), action: "enqueueBatch", items, startAfterEnqueue };
}

export function sendBatch(request) {
  // Invoke synchronously inside a REAL button click (no await before this call).
  // Keep this exact request in memory for a user-triggered retry after timeout.
  return exchange(request, 65000);
}

// React integration sketch:
// const readyItems = await prepareTvmoonItems(selectedDownloadItems, location.href);
// const preparedRequest = makeBatch(readyItems); // state, memory only
// <button onClick={() => sendBatch(preparedRequest).then(showHandoffResult)}>
//   交給添丁下載
// </button>
// On PARTIAL, show rejected results; create a NEW request for corrected items.
// On HANDOFF_TIMEOUT, present a Retry button which calls sendBatch with the SAME
// object. Do not automatically retry, refresh mediaUrl, or persist signed URLs.
