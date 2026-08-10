import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

export const app = express();

app.use(helmet({
    // This is a pure JSON API consumed cross-origin by separate web (Vite,
    // its own port) and mobile clients — helmet's default 'same-origin'
    // Cross-Origin-Resource-Policy blocks the browser from reading ANY
    // response here even when the Access-Control-Allow-Origin header below
    // is correct. That combination shows up in devtools as a CORS failure,
    // but it isn't one — CORP is a separate opt-in isolation header, not
    // part of the CORS handshake, and 'cross-origin' is the correct value
    // for an API meant to be fetched from other origins by design.
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors());
// The `verify` callback stashes the exact request bytes on `req.rawBody`
// before JSON-parsing mutates them. Razorpay signs the raw webhook body, so
// POST /payments/webhook needs byte-for-byte access to what was received —
// re-serializing the parsed JSON would not reproduce an identical signature.
app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
}));
app.use(morgan("dev"));

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);
