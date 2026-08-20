import { createBallotlyApi } from "../server/app";

/**
 * This source entry is bundled by the production build into api/index.js.
 * Vercel executes that self-contained JavaScript function instead of resolving
 * the application’s TypeScript module graph at runtime.
 */
const app = createBallotlyApi();

export default app;
