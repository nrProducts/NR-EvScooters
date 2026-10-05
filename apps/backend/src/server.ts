import { app } from "./app";
import { env } from "./config/env";
import { reportGatewayKeyStatus } from "./config/razorpay";

app.listen(env.port, () => {
    console.log(`Backend running on port ${env.port}`);
    // Fire-and-forget: surfaces a dead payment key in the boot log instead
    // of leaving it to be discovered by a rider inside Checkout.
    void reportGatewayKeyStatus();
});
