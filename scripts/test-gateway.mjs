// Local test routing only. Not a production gateway. Binds loopback exclusively.
import { createServer, request } from "node:http";
import { readFileSync } from "node:fs";
const vars = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
if (vars.SERMONBRIDGE_LOCAL_TEST !== "true")
  throw new Error("Local fixture configuration required");
createServer((req, res) => {
  const auth = req.url.startsWith("/auth/v1/");
  const rest = req.url.startsWith("/rest/v1/");
  if (!auth && !rest) {
    res.writeHead(404);
    res.end();
    return;
  }
  const upstream = request(
    {
      host: "127.0.0.1",
      port: auth ? 54324 : 54323,
      path: req.url.replace(auth ? "/auth/v1" : "/rest/v1", ""),
      method: req.method,
      headers: {
        ...req.headers,
        authorization:
          req.headers.authorization ??
          `Bearer ${vars.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
    },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end("Local test service unavailable");
  });
  req.pipe(upstream);
}).listen(54321, "127.0.0.1", () =>
  console.log("Local test gateway ready on port 54321"),
);
