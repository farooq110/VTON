import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  generateInvoiceSchema,
  listInvoicesQuerySchema,
  invoiceIdParamsSchema,
} from '../schemas/invoice.schema';
import * as invoiceService from '../services/invoice.service';
import { parsePaging } from '../utils/pagination';
import { sendOk, sendPaginated } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.post(
  '/generate',
  validate({ body: generateInvoiceSchema }),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.generateInvoice(req.body);
    return sendOk(res, invoice, 201, 'Invoice generated');
  }),
);

router.get(
  '/list',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const customerId =
      typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await invoiceService.listInvoices({
      ...paging,
      customerId,
      status,
    });
    return sendPaginated(res, result);
  }),
);

router.get(
  '/:id',
  validate({ params: invoiceIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoice(req.params.id);
    return sendOk(res, invoice);
  }),
);

router.post(
  '/:id/send',
  validate({ params: invoiceIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.markInvoiceSent(req.params.id);
    return sendOk(res, invoice, 200, 'Invoice marked as sent');
  }),
);

// silence unused
void listInvoicesQuerySchema;

export default router;
