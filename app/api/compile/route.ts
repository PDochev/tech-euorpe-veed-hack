import { compile } from "@/app/_lib/pipeline";
import type { StageEvent } from "@/app/_lib/types";

/**
 * Streams the compile pipeline as Server-Sent Events.
 *
 * The run takes minutes and its value is largely in watching it happen, so the
 * UI needs progress rather than a single response at the end.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    target: string;
    username?: string;
    password?: string;
    force?: string[];
    skipScout?: boolean;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StageEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        for await (const event of compile({
          target: body.target,
          creds: { username: body.username ?? "", password: body.password ?? "" },
          force: body.force,
          skipScout: body.skipScout,
        })) {
          send(event);
        }
      } catch (err) {
        send({ type: "stage:error", stage: "emit", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
