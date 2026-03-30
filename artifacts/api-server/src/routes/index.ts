import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import healthRouter from "./health";
import downloaderRouter from "./tools/downloader";
import clipperRouter from "./tools/clipper";
import transcriberRouter from "./tools/transcriber";
import converterRouter from "./tools/converter";
import animeRouter from "./tools/anime";
import podcastRouter from "./tools/podcast";

const router: IRouter = Router();

const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، يرجى الانتظار قليلاً ثم المحاولة مجدداً." },
});

const infoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، يرجى الانتظار قليلاً ثم المحاولة مجدداً." },
});

router.use(healthRouter);
router.use("/downloader/info", infoLimiter);
router.use("/downloader/download", heavyLimiter);
router.use("/clipper/info", infoLimiter);
router.use("/clipper/clip", heavyLimiter);
router.use("/transcriber", heavyLimiter);
router.use("/converter", heavyLimiter);
router.use("/anime", heavyLimiter);
router.use("/podcast", heavyLimiter);

router.use("/downloader", downloaderRouter);
router.use("/clipper", clipperRouter);
router.use("/transcriber", transcriberRouter);
router.use("/converter", converterRouter);
router.use("/anime", animeRouter);
router.use("/podcast", podcastRouter);

export default router;
