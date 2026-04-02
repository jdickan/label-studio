import { Router, type IRouter } from "express";
import healthRouter from "./health";
import labelSheetsRouter from "./labelSheets";
import labelTemplatesRouter from "./labelTemplates";
import labelDesignsRouter from "./labelDesigns";
import designSystemRouter from "./designSystem";
import productsRouter from "./products";
import printJobsRouter from "./printJobs";
import dashboardRouter from "./dashboard";
import pdfAnalysisRouter from "./pdfAnalysis";
import labelAnalysisRouter from "./labelAnalysis";
import magicUploadRouter from "./magicUpload";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/label-sheets", labelSheetsRouter);
router.use("/label-sheets", pdfAnalysisRouter);
router.use("/label-templates", labelTemplatesRouter);
router.use("/label-templates", labelAnalysisRouter);
router.use("/label-designs", labelDesignsRouter);
router.use("/design-system", designSystemRouter);
router.use("/products", productsRouter);
router.use("/print-jobs", printJobsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/magic-upload", magicUploadRouter);

export default router;
