import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { productListQuerySchema, productIdSchema } from '../schemas/product.schema';
import * as productService from '../services/product.service';
import { sendOk } from '../utils/response';

/**
 * Product routes — public read (any authed user), admin write.
 *
 *   GET /api/products        → list with filters + paging
 *   GET /api/products/:id    → single product by id
 *
 * The response shape matches what the frontend's `unwrapProductList` and
 * `unwrapProduct` helpers expect (`{ products: [...] }` and `{ product: {...} }`).
 */
const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await productService.listProducts(req.query as any);
    return sendOk(res, {
      products: result.products,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  }),
);

router.get(
  '/:id',
  validate({ params: productIdSchema }),
  asyncHandler(async (req, res) => {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      throw new Error('NOT_FOUND: Product not found');
    }
    return sendOk(res, { product });
  }),
);

export default router;
