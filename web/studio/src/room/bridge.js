/*
 * What the page in index.html expects from its host. Here the calls go to this app's API routes. Injected
 * ahead of the page's own script by /script-room, which also sets __LOCAL__.
 */
(() => {
  const send = async (url, init) => {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      const error = body.error || {};
      throw {
        code: error.code || "upstream_error",
        message: error.message || "Request failed",
      };
    }
    return body;
  };

  /* ---------- db: documents kept as files by /api/store ---------- */
  const listeners = new Set();

  const refresh = async (listener) => {
    const seq = ++listener.seq;
    try {
      const snapshot = await listener.read();
      if (seq === listener.seq && listener.live) listener.next(snapshot);
    } catch (error) {
      if (seq === listener.seq && listener.live && listener.fail)
        listener.fail(error);
    }
  };

  const listen = (matches, read, next, fail) => {
    const listener = { matches, read, next, fail, seq: 0, live: true };
    listeners.add(listener);
    refresh(listener);
    return () => {
      listener.live = false;
      listeners.delete(listener);
    };
  };

  const written = (path) => {
    for (const listener of listeners)
      if (listener.matches(path)) refresh(listener);
  };

  const docRef = (path) => ({
    onSnapshot: (next, fail) =>
      listen(
        (changed) => changed === path,
        async () => {
          const { doc } = await send(
            "/api/store?doc=" + encodeURIComponent(path)
          );
          return { exists: doc != null, data: () => doc };
        },
        next,
        fail
      ),
    async set(data) {
      await send("/api/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, data }),
      });
      written(path);
    },
    async delete() {
      await send("/api/store?doc=" + encodeURIComponent(path), {
        method: "DELETE",
      });
      written(path);
    },
  });

  const collectionRef = (path, order, count) => ({
    orderBy: (field) => collectionRef(path, field, count),
    limit: (max) => collectionRef(path, order, max),
    doc: (id) => docRef(path + "/" + id),
    onSnapshot: (next, fail) =>
      listen(
        (changed) => changed.slice(0, changed.lastIndexOf("/")) === path,
        async () => {
          const query = new URLSearchParams({ collection: path });
          if (order) query.set("orderBy", order);
          if (count) query.set("limit", String(count));
          const { docs, truncated } = await send("/api/store?" + query);
          return {
            truncated,
            docs: docs.map((doc) => ({ id: doc.id, data: () => doc.data })),
          };
        },
        next,
        fail
      ),
  });

  const db = { collection: (path) => collectionRef(path), doc: docRef };

  /* ---------- sample: ChatGPT through /api/sample ---------- */
  const toBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const sample = {
    limits: async () => ({ images: { maxCount: 4 } }),
    async json(input, options = {}) {
      const messages =
        typeof input === "string" ? [{ role: "user", content: input }] : input;
      const images = await Promise.all(
        (options.images || []).map(async (image) => ({
          mediaType: image.type || "image/jpeg",
          data: await toBase64(image),
        }))
      );
      try {
        const { result } = await send("/api/sample", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            images,
            modelTier: options.modelTier,
            effort: options.effort,
          }),
          signal: options.signal,
        });
        return result;
      } catch (error) {
        if (error && error.name === "AbortError") throw { code: "cancelled" };
        throw error;
      }
    },
  };

  /* ---------- downloads: an ordinary browser download ---------- */
  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(new Blob([data], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
  };

  const user = { id: async () => "local" };
  const capabilities = { db, sample, user, downloads };

  window.studio = { use: async (name) => capabilities[name] || null };
})();
