import { z } from "zod";

const postSchema = z.object({
  status: z.enum(["online", "busy"]),
});
const statusSchema = z.object({
  status: z.enum(["online", "busy"]),
  timestamp: z.number(),
});
// const getSchema = z.object({
//   status: z.enum(["online", "busy", "offline"]),
//   lastOnline: z.date().optional(),
// });

const tenMinites = 1000 * 60 * 10;

// deno-lint-ignore no-explicit-any
async function setStatus(body: any, kv: Deno.Kv, token?: string) {
  const key = await kv.get(["settings", "key"]);
  if (!key.value || !token || token !== key.value) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const ot = postSchema.parse(body);
    await kv.set(["status"], {
      status: ot.status,
      timestamp: Date.now(),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return new Response(JSON.stringify(e.errors), { status: 400 });
    }
  }
  return new Response("OK", { status: 200 });
}

async function main() {
  const kv = await Deno.openKv();
  const key = Deno.env.get("SECRET_KEY");
  if (!key) {
    console.error("SECRET_KEY is not set");
    Deno.exit(1);
  }
  await kv.set(["settings", "key"], Deno.env.get("SECRET_KEY"));
  await kv.set(["status"], {
    status: "online",
    timestamp: Date.now(),
  });

  Deno.serve(async (req) => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path !== "/") {
      return new Response("Not Found", { status: 404 });
    }
    if (req.method === "GET") {
      try {
        const rawStatus = await kv.get(["status"]);
        const lastStatus = statusSchema.parse(rawStatus.value);
        const status = Date.now() - lastStatus.timestamp > tenMinites
          ? "offline"
          : lastStatus.status;
        return new Response(
          JSON.stringify({
            ...lastStatus,
            status,
          }),
          { status: 200 },
        );
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error(e.errors);
        }
        return new Response("Server Error", { status: 500 });
      }
    }
    if (req.method === "POST") {
      const token = req.headers.get("Authorization")?.split(" ")[1];
      return setStatus(await req.json(), kv, token);
    }
    return new Response("Not Found", { status: 404 });
  });
}

if (import.meta.main) {
  main();
}
