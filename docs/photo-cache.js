// Object URLs belong to a storage path for the lifetime of its current snapshot.
export function createPhotoCache(fetchBlob) {
  const entries = new Map();
  return {
    retain(paths) {
      for (const [path, entry] of entries) {
        if (paths.has(path)) continue;
        if (entry.url) URL.revokeObjectURL(entry.url);
        entries.delete(path);
      }
    },
    get(path) {
      let entry = entries.get(path);
      if (!entry) {
        entry = {};
        entries.set(path, entry);
        entry.request = fetchBlob(path).then(blob => {
          // The path can be removed and fetched again before the first request finishes.
          if (entries.get(path) !== entry) return;
          entry.url = URL.createObjectURL(blob);
          return entry.url;
        }).catch(error => {
          if (entries.get(path) === entry) entries.delete(path);
          throw error;
        });
      }
      return entry.request;
    }
  };
}
