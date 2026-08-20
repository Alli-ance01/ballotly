import { createBallotlyApi } from "../server/app";

// Vercel invokes this Express application as a serverless function. The
// frontend is emitted separately as Vite static output in dist/public.
const app = createBallotlyApi();

export default app;
