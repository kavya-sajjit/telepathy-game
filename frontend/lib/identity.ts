const ID_KEY = "telepathy:pid";
const NAME_KEY = "telepathy:name";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function playerId(): string {
  return safe(() => {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  }, Math.random().toString(36).slice(2));
}

export function savedName(): string {
  return safe(() => localStorage.getItem(NAME_KEY) || "", "");
}

export function saveName(name: string) {
  safe(() => localStorage.setItem(NAME_KEY, name.trim().slice(0, 16)), undefined);
}
