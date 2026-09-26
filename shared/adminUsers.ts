export interface AdminUser {
  id:string;handle:string;name:string;createdAt:string;balanceNanos:number;reservedNanos:number;discoverable:boolean;suspended:boolean;starterGranted:boolean;
}
export interface AdminUserPage {items:AdminUser[];nextCursor:string|null;total:number;stage:'development'|'staging'|'production'}
