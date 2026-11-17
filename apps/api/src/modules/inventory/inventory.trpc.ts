// ─── Inventory tRPC Router ─────────────────────────────────────
// All inventory API endpoints exposed via tRPC.

import { Injectable } from '@nestjs/common';
import { TrpcService } from '../../trpc/trpc.service';
import { InventoryService } from './inventory.service';
import { InventoryValuationService } from './inventory.valuation.service';
import { z } from 'zod';
import { withBigIntFields } from './inventory.bigint-input';
import {
  CreateStockItemSchema,
  UpdateStockItemSchema,
  StockItemListInputSchema,
  CreateStockMovementSchema,
  StockMovementListInputSchema,
  CreateStockTransferSchema,
  StockTransferListInputSchema,
  CreateStockTakeSchema,
  StockTakeItemInputSchema,
  StockTakeListInputSchema,
  MetalStockAdjustSchema,
  StoneStockInputSchema,
  StoneStockAdjustSchema,
  StoneStockListInputSchema,
  CreateMetalRecoverySchema,
  CompleteMetalRecoverySchema,
  MetalRecoveryListInputSchema,
  CreateBatchLotSchema,
  BatchLotListInputSchema,
  CreateSerialNumberSchema,
  UpdateSerialStatusSchema,
  SerialNumberListInputSchema,
  StockValuationRequestSchema,
  ProductWithStockInputSchema,
} from '@caratflow/shared-types';

@Injectable()
export class InventoryTrpcRouter {
  constructor(
    private readonly trpc: TrpcService,
    private readonly inventoryService: InventoryService,
    private readonly valuationService: InventoryValuationService,
  ) {}

  get router() {
    return this.trpc.router({
      stockItems: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(StockItemListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.findAllStockItems(ctx.tenantId, input),
          ),

        getById: this.trpc.authedProcedure
          .input(z.object({ id: z.guid() }))
          .query(({ ctx, input }) =>
            this.inventoryService.findStockItemById(ctx.tenantId, input.id),
          ),

        create: this.trpc.authedProcedure
          .input(CreateStockItemSchema)
          .mutation(({ ctx, input }) =>
            this.inventoryService.createStockItem(ctx.tenantId, ctx.userId, input),
          ),

        update: this.trpc.authedProcedure
          .input(z.object({ id: z.guid(), data: UpdateStockItemSchema }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.updateStockItem(ctx.tenantId, ctx.userId, input.id, input.data),
          ),
      }),

      movements: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(StockMovementListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.findAllMovements(ctx.tenantId, input),
          ),

        record: this.trpc.authedProcedure
          .input(withBigIntFields(CreateStockMovementSchema, ['unitCostPaise']))
          .mutation(({ ctx, input }) =>
            this.inventoryService.recordMovement(ctx.tenantId, ctx.userId, input),
          ),
      }),

      transfers: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(StockTransferListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.findAllTransfers(ctx.tenantId, input),
          ),

        create: this.trpc.authedProcedure
          .input(CreateStockTransferSchema)
          .mutation(({ ctx, input }) =>
            this.inventoryService.createTransfer(ctx.tenantId, ctx.userId, input),
          ),

        approve: this.trpc.authedProcedure
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.approveTransfer(ctx.tenantId, ctx.userId, input.id),
          ),

        receive: this.trpc.authedProcedure
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.receiveTransfer(ctx.tenantId, ctx.userId, input.id),
          ),

        cancel: this.trpc.authedProcedure
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.cancelTransfer(ctx.tenantId, ctx.userId, input.id),
          ),
      }),

      stockTakes: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(StockTakeListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.findAllStockTakes(ctx.tenantId, input),
          ),

        create: this.trpc.authedProcedure
          .input(CreateStockTakeSchema)
          .mutation(({ ctx, input }) =>
            this.inventoryService.createStockTake(ctx.tenantId, ctx.userId, input),
          ),

        start: this.trpc.authedProcedure
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.startStockTake(ctx.tenantId, ctx.userId, input.id),
          ),

        addCounts: this.trpc.authedProcedure
          .input(z.object({
            stockTakeId: z.guid(),
            counts: z.array(StockTakeItemInputSchema),
          }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.addStockTakeCounts(
              ctx.tenantId, ctx.userId, input.stockTakeId, input.counts,
            ),
          ),

        complete: this.trpc.authedProcedure
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.completeStockTake(ctx.tenantId, ctx.userId, input.id),
          ),
      }),

      metalStock: this.trpc.router({
        getByLocation: this.trpc.authedProcedure
          .input(z.object({ locationId: z.guid() }))
          .query(({ ctx, input }) =>
            this.inventoryService.getMetalStockByLocation(ctx.tenantId, input.locationId),
          ),

        adjust: this.trpc.authedProcedure
          .input(withBigIntFields(MetalStockAdjustSchema, ['weightChangeMg', 'valueChangePaise']))
          .mutation(({ ctx, input }) =>
            this.inventoryService.adjustMetalStock(ctx.tenantId, ctx.userId, input),
          ),
      }),

      stoneStock: this.trpc.router({
        getByLocation: this.trpc.authedProcedure
          .input(StoneStockListInputSchema)
          .query(({ ctx, input }) => {
            const { locationId, ...filters } = input;
            return this.inventoryService.getStoneStockByLocation(ctx.tenantId, locationId, filters);
          }),

        create: this.trpc.authedProcedure
          .input(withBigIntFields(StoneStockInputSchema, ['totalWeightMg', 'valuePaise']))
          .mutation(({ ctx, input }) =>
            this.inventoryService.createStoneStock(ctx.tenantId, ctx.userId, input),
          ),

        adjust: this.trpc.authedProcedure
          .input(withBigIntFields(StoneStockAdjustSchema, ['weightChangeMg', 'valueChangePaise']))
          .mutation(({ ctx, input }) =>
            this.inventoryService.adjustStoneStock(ctx.tenantId, ctx.userId, input),
          ),
      }),

      metalRecovery: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(MetalRecoveryListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.listMetalRecoveries(ctx.tenantId, input),
          ),

        create: this.trpc.authedProcedure
          .input(withBigIntFields(CreateMetalRecoverySchema, ['grossWeightMg']))
          .mutation(({ ctx, input }) =>
            this.inventoryService.createMetalRecovery(ctx.tenantId, ctx.userId, input),
          ),

        complete: this.trpc.authedProcedure
          .input(withBigIntFields(CompleteMetalRecoverySchema, ['recoveredFineMg', 'valuePaise']))
          .mutation(({ ctx, input }) =>
            this.inventoryService.completeMetalRecovery(ctx.tenantId, ctx.userId, input),
          ),
      }),

      batchLots: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(BatchLotListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.findBatchLotsByProduct(ctx.tenantId, input),
          ),

        create: this.trpc.authedProcedure
          .input(CreateBatchLotSchema)
          .mutation(({ ctx, input }) =>
            this.inventoryService.createBatchLot(ctx.tenantId, ctx.userId, input),
          ),
      }),

      serialNumbers: this.trpc.router({
        list: this.trpc.authedProcedure
          .input(SerialNumberListInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.findAllSerialNumbers(ctx.tenantId, input),
          ),

        create: this.trpc.authedProcedure
          .input(CreateSerialNumberSchema)
          .mutation(({ ctx, input }) =>
            this.inventoryService.createSerialNumber(ctx.tenantId, ctx.userId, input),
          ),

        updateStatus: this.trpc.authedProcedure
          .input(UpdateSerialStatusSchema)
          .mutation(({ ctx, input }) =>
            this.inventoryService.updateSerialNumberStatus(ctx.tenantId, ctx.userId, input),
          ),

        generateQr: this.trpc.authedProcedure
          .input(z.object({ serialNumber: z.string() }))
          .mutation(({ ctx, input }) =>
            this.inventoryService.generateSerialQr(ctx.tenantId, ctx.userId, input.serialNumber),
          ),

        findBySerial: this.trpc.authedProcedure
          .input(z.object({ serialNumber: z.string() }))
          .query(({ ctx, input }) =>
            this.inventoryService.findSerialByNumber(ctx.tenantId, input.serialNumber),
          ),
      }),

      valuation: this.trpc.router({
        calculate: this.trpc.authedProcedure
          .input(withBigIntFields(StockValuationRequestSchema, ['currentRatePaise']))
          .query(({ ctx, input }) =>
            this.valuationService.calculateValuation(ctx.tenantId, input),
          ),
      }),

      dashboard: this.trpc.router({
        get: this.trpc.authedProcedure.query(({ ctx }) =>
          this.inventoryService.getDashboard(ctx.tenantId),
        ),
      }),

      products: this.trpc.router({
        // Product + stock-by-location aggregation for the mobile Sales app.
        getWithStock: this.trpc.authedProcedure
          .input(ProductWithStockInputSchema)
          .query(({ ctx, input }) =>
            this.inventoryService.getProductWithStock(ctx.tenantId, input.productId),
          ),
      }),
    });
  }
}
