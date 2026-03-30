import { Router, type IRouter } from "express";
import healthRouter from "./health";
import downloaderRouter from "./tools/downloader";
import clipperRouter from "./tools/clipper";
import transcriberRouter from "./tools/transcriber";
import converterRouter from "./tools/converter";
import animeRouter from "./tools/anime";
import podcastRouter from "./tools/podcast";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/downloader", downloaderRouter);
router.use("/clipper", clipperRouter);
router.use("/transcriber", transcriberRouter);
router.use("/converter", converterRouter);
router.use("/anime", animeRouter);
router.use("/podcast", podcastRouter);

export default router;
