// Shared Razorpay payment helper for AOS
// Loaded before index.js / dashboard.js on both pages.
(function () {
    if (window.AOSRazorpay) return;

    const PAYMENT_CONFIG_URL = "/api/payment/config";
    const CREATE_ORDER_URL = "/api/payment/create-order";
    const VERIFY_URL = "/api/payment/verify";

    const tierFees = {
        "Executive Platinum": 1500,
        "Gold Elite": 1000,
        "Silver Preferred": 500
    };

    async function fetchJson(url, opts) {
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.message || ("Request failed: " + res.status));
        }
        return data;
    }

    async function getConfig() {
        return fetchJson(PAYMENT_CONFIG_URL, {
            method: "GET",
            credentials: "same-origin"
        });
    }

    async function ensureRazorpayScript() {
        if (window.Razorpay) return true;
        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://checkout.razorpay.com/v1/checkout.js";
            script.onload = resolve;
            script.onerror = () => reject(new Error("Failed to load Razorpay checkout script."));
            document.body.appendChild(script);
        });
        return true;
    }

    /**
     * Open the Razorpay checkout for a given amount (INR).
     * Resolves with { orderId, paymentId, signature } on successful & verified payment.
     * Throws on failure/cancellation/config error.
     *
     * @param {object} opts
     * @param {number|string} opts.amount - amount in Rupees
     * @param {string} opts.purpose - short label e.g. "membership" | "ticket"
     * @param {string} [opts.referenceId]
     * @param {object} [opts.prefill] - {name, email, contact}
     */
    async function openCheckout(opts) {
        const config = await getConfig();
        if (!config.ready || !config.keyId) {
            throw new Error("Razorpay is not configured. Please contact administrator.");
        }

        const order = await fetchJson(CREATE_ORDER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                amount: opts.amount,
                purpose: opts.purpose,
                referenceId: opts.referenceId || ""
            })
        });

        await ensureRazorpayScript();

        const prefill = opts.prefill || {};

        return new Promise(async (resolve, reject) => {
            let settled = false;
            let rzp = null;

            const options = {
                key: config.keyId,
                amount: order.amountPaise,
                currency: order.currency || "INR",
                name: "AOS Airlines",
                description: (opts.purpose || "payment").toUpperCase(),
                order_id: order.orderId,
                prefill: {
                    name: prefill.name || "",
                    email: prefill.email || "",
                    contact: prefill.contact || ""
                },
                theme: { color: "#0284c7" },
                handler: async function (response) {
                    try {
                        await fetchJson(VERIFY_URL, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "same-origin",
                            body: JSON.stringify({
                                razorpayOrderId: response.razorpay_order_id,
                                razorpayPaymentId: response.razorpay_payment_id,
                                razorpaySignature: response.razorpay_signature
                            })
                        });
                        if (!settled) {
                            settled = true;
                            resolve({
                                orderId: response.razorpay_order_id,
                                paymentId: response.razorpay_payment_id,
                                signature: response.razorpay_signature
                            });
                        }
                    } catch (err) {
                        if (!settled) {
                            settled = true;
                            reject(err);
                        }
                    }
                },
                modal: {
                    ondismiss: function () {
                        if (!settled) {
                            settled = true;
                            reject(new Error("PAYMENT_CANCELLED"));
                        }
                    }
                }
            };

            try {
                rzp = new Razorpay(options);
                rzp.on("payment.failed", function (resp) {
                    if (!settled) {
                        settled = true;
                        reject(new Error(resp.error && resp.error.description
                            ? resp.error.description
                            : "PAYMENT_FAILED"));
                    }
                });
                rzp.open();
            } catch (err) {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            }
        });
    }

    function membershipFeeFor(tier) {
        if (!tier) return 0;
        const t = String(tier).toUpperCase();
        if (tierFees[tier] !== undefined) return tierFees[tier];
        if (t.indexOf("EXECUTIVE") !== -1 || t.indexOf("PLATINUM") !== -1) return 1500;
        if (t.indexOf("GOLD") !== -1) return 1000;
        if (t.indexOf("SILVER") !== -1) return 500;
        return 0;
    }

    window.AOSRazorpay = {
        getConfig: getConfig,
        openCheckout: openCheckout,
        membershipFeeFor: membershipFeeFor,
        tierFees: tierFees
    };
})();
