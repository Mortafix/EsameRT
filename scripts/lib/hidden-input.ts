import { emitKeypressEvents } from "node:readline";

export async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Il codice deve essere inserito da un terminale interattivo (TTY).",
    );
  }

  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const previousRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  return await new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
    };

    const onKeypress = (
      character: string,
      key: { ctrl?: boolean; name?: string; sequence?: string },
    ) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Operazione annullata."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }

      if (key.name === "backspace") {
        if (value.length > 0) {
          value = [...value].slice(0, -1).join("");
          process.stdout.write("\b \b");
        }
        return;
      }

      if (
        !key.ctrl &&
        character &&
        !key.sequence?.startsWith("\u001b") &&
        !/[\r\n]/u.test(character)
      ) {
        value += character;
        process.stdout.write("•");
      }
    };

    input.on("keypress", onKeypress);
  });
}
