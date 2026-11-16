// ─── Search REST Controller ─────────────────────────────────────
// Public-facing search API at /api/v1/store/search/*
// Used by the storefront for search, autocomplete, popular,
// and recent searches.

import {
  Controller,
  Get,
  Delete,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiResponse } from '@caratflow/shared-types';
import type {
  SearchResponse,
  AutocompleteResponse,
} from '@caratflow/shared-types';
import { SearchService } from './search.service';
import { extractContext, type HeaderBearingRequest } from '../../common/customer-identity';

/** Maximum accepted length of a search query (characters). */
const MAX_QUERY_LENGTH = 200;

/** Trim and cap a raw query string. */
function normalizeQuery(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

@Controller('api/v1/store/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /api/v1/store/search?q=&filters=&page=&limit=&sort=
   * Full-text search with filters, facets, and scoring.
   */
  @Get()
  async search(
    @Req() req: HeaderBearingRequest,
    @Query('q') q?: string,
    @Query('filters') filtersJson?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ): Promise<ApiResponse<SearchResponse>> {
    const ctx = extractContext(req);
    if (!q || !q.trim()) throw new BadRequestException('Search query (q) is required');
    const query = normalizeQuery(q);

    let filters: Record<string, unknown> | undefined;
    if (filtersJson) {
      try {
        filters = JSON.parse(filtersJson);
      } catch {
        throw new BadRequestException('Invalid filters JSON');
      }
    }

    const data = await this.searchService.search(
      ctx.tenantId,
      query,
      filters as unknown as import('@caratflow/shared-types').SearchFilters | undefined,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      sort,
      ctx.customerId,
    );
    return success(data);
  }

  /**
   * GET /api/v1/store/search/autocomplete?q=
   * Fast autocomplete with products, categories, suggestions.
   */
  @Get('autocomplete')
  async autocomplete(
    @Req() req: HeaderBearingRequest,
    @Query('q') q?: string,
  ): Promise<ApiResponse<AutocompleteResponse>> {
    const ctx = extractContext(req);
    if (!q || !q.trim()) throw new BadRequestException('Query (q) is required');

    const data = await this.searchService.autocomplete(
      ctx.tenantId,
      normalizeQuery(q),
      8,
      ctx.customerId,
    );
    return success(data);
  }

  /**
   * GET /api/v1/store/search/popular
   * Get popular/trending search queries.
   */
  @Get('popular')
  async popularSearches(
    @Req() req: HeaderBearingRequest,
    @Query('limit') limit?: string,
  ): Promise<ApiResponse<string[]>> {
    const ctx = extractContext(req);
    const data = await this.searchService.getPopularSearches(
      ctx.tenantId,
      limit ? parseInt(limit, 10) : 10,
    );
    return success(data);
  }

  /**
   * GET /api/v1/store/search/recent
   * Get recent searches for the logged-in customer.
   */
  @Get('recent')
  async recentSearches(
    @Req() req: HeaderBearingRequest,
    @Query('limit') limit?: string,
  ): Promise<ApiResponse<string[]>> {
    const ctx = extractContext(req);
    if (!ctx.customerId) throw new UnauthorizedException('Customer login required');

    const data = await this.searchService.getRecentSearches(
      ctx.customerId,
      limit ? parseInt(limit, 10) : 10,
    );
    return success(data);
  }

  /**
   * DELETE /api/v1/store/search/recent
   * Clear all recent searches for the logged-in customer.
   */
  @Delete('recent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearRecentSearches(
    @Req() req: HeaderBearingRequest,
  ): Promise<void> {
    const ctx = extractContext(req);
    if (!ctx.customerId) throw new UnauthorizedException('Customer login required');
    await this.searchService.clearRecentSearches(ctx.customerId);
  }
}
