import { context } from "$live/live.ts";

export const verifyDomain = (hostname: string) => {
  if (!context.domains.includes(hostname)) {
    console.log("Domain not found:", hostname);
    console.log("Configured domains:", context.domains);

    // TODO: render custom 404 page
    return new Response("Domain not registered for this site.", {
      status: 404,
    });
  }
};
