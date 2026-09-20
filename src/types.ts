export interface ExtractedDataResponse {
  success: boolean;
  url: string;
  parseMethod: string;
  rawLength: number;
  data: any;
  error?: string;
}

export interface BuyModel {
  model?: string;
  modelNumber?: string;
  orderablePartNumber?: string;
  package?: string;
  packageDescription?: string;
  packingOption?: string;
  packingQty?: string;
  minOrderQty?: number | string;
  listPrice1?: string | number;
  listPrice500?: string | number;
  listPrice1k?: string | number;
  leadTime?: number | string;
  lifeCycle?: string;
  tempRange?: string;
  pricePerQty?: Array<{ price: string; quantity: string }>;
  [key: string]: any;
}

export interface PartItem {
  id?: string | number;
  generic?: string;
  GenericCode?: string;
  productLifeCycleStatus?: string;
  description?: string;
  buyModels?: BuyModel[];
  [key: string]: any;
}
