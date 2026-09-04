import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  createBuyerMandate,
  getDashboard,
  runConfirmPayment,
  runCreateOrder,
  runGetCatalog,
  runQuote,
} from "./commerce/service";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  commerce: router({
    dashboard: publicProcedure.query(() => getDashboard()),
    createMandate: publicProcedure.input(z.object({
      label: z.string().trim().min(3).max(120),
      spendCapPaise: z.number().int().min(5000).max(5_000_000),
      expiresInHours: z.number().int().min(1).max(24 * 30),
    })).mutation(({ input }) => createBuyerMandate(input)),
    getCatalog: publicProcedure.mutation(() => runGetCatalog()),
    quote: publicProcedure.input(z.object({
      mandateId: z.string().min(1),
      sku: z.string().min(1),
      rationale: z.string().trim().min(5).max(320),
    })).mutation(({ input }) => runQuote(input)),
    createOrder: publicProcedure.input(z.object({
      mandateId: z.string().min(1),
      quoteId: z.string().min(1),
      rationale: z.string().trim().min(5).max(320),
    })).mutation(({ input }) => runCreateOrder(input)),
    confirmPayment: publicProcedure.input(z.object({
      orderId: z.string().min(1),
      rationale: z.string().trim().min(5).max(320),
    })).mutation(({ input }) => runConfirmPayment(input)),
  }),
});

export type AppRouter = typeof appRouter;

