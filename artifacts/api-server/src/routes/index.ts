import { Router, type IRouter } from "express";
import healthRouter from "./health";
import labelSheetsRouter from "./labelSheets";
import labelTemplatesRouter from "./labelTemplates";
import designSystemRouter from "./designSystem";
import productsRouter from "./products";
import printJobsRouter from "./printJobs";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/label-sheets", labelSheetsRouter);
router.use("/label-templates", labelTemplatesRouter);
router.use("/design-system", designSystemRouter);
router.use("/products", productsRouter);
router.use("/print-jobs", printJobsRouter);
router.use("/dashboard", dashboardRouter);

export default router;
