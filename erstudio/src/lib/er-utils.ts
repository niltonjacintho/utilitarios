import {
  DbDialect,
  ErAiOperation,
  ErColumn,
  ErPendingChange,
  ErProjectRecord,
  ErRelation,
  ErSubModel,
  ErTable,
} from '@/types/erstudio';

export const COLUMN_TYPES = [
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'varchar',
  'char',
  'text',
  'decimal',
  'numeric',
  'float',
  'boolean',
  'date',
  'datetime',
  'timestamp',
  'uuid',
  'json',
  'jsonb',
];

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDialectLabel(dialect: DbDialect): string {
  switch (dialect) {
    case 'mysql':
      return 'MySQL';
    case 'postgresql':
      return 'PostgreSQL';
    case 'sqlserver':
      return 'SQL Server';
    case 'sqlite':
      return 'SQLite';
  }
}

export function formatAccessLabel(level: 'owner' | 'edit' | 'view'): string {
  switch (level) {
    case 'owner':
      return 'DONO';
    case 'edit':
      return 'EDIÇÃO';
    default:
      return 'LEITURA';
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatColType(col: { type: string; length?: string }): string {
  return col.length?.trim() ? `${col.type}(${col.length.trim()})` : col.type;
}

export function getTableCardSize(
  table: ErTable,
  expanded: boolean,
): { width: number; height: number } {
  const width = expanded ? 430 : 272;
  const headerH = 38 + (expanded ? 24 : 0);
  const rowH = 26;
  const height = headerH + Math.max(1, table.columns.length) * rowH + 14;
  return { width, height };
}

export function layoutSubModelHierarchical(
  tables: ErTable[],
  relations: ErRelation[],
  subModel: ErSubModel,
  expanded: boolean,
): Record<string, { x: number; y: number }> {
  const selectedIds = new Set(subModel.tableIds);
  const subTables = tables.filter((t) => selectedIds.has(t.id));
  const subRels = relations.filter(
    (r) => selectedIds.has(r.fromTableId) && selectedIds.has(r.toTableId),
  );

  // Tabelas referenciadas (pai) ficam à direita ou em níveis hierárquicos
  const inDegree = new Map<string, number>();
  const outMap = new Map<string, string[]>();
  for (const t of subTables) {
    inDegree.set(t.id, 0);
    outMap.set(t.id, []);
  }
  for (const r of subRels) {
    outMap.get(r.fromTableId)?.push(r.toTableId);
    inDegree.set(r.toTableId, (inDegree.get(r.toTableId) ?? 0) + 1);
  }

  const levelOf = new Map<string, number>();
  const queue: string[] = [];
  for (const t of subTables) {
    if ((inDegree.get(t.id) ?? 0) === 0) {
      levelOf.set(t.id, 0);
      queue.push(t.id);
    }
  }
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const lv = levelOf.get(curr) ?? 0;
    for (const next of outMap.get(curr) ?? []) {
      const cand = lv + 1;
      if ((levelOf.get(next) ?? -1) < cand && cand <= subTables.length) {
        levelOf.set(next, cand);
        queue.push(next);
      }
    }
  }
  for (const t of subTables) {
    if (!levelOf.has(t.id)) levelOf.set(t.id, 0);
  }

  const byLevel = new Map<number, ErTable[]>();
  for (const t of subTables) {
    const lv = levelOf.get(t.id) ?? 0;
    const list = byLevel.get(lv) ?? [];
    list.push(t);
    byLevel.set(lv, list);
  }

  const positions: Record<string, { x: number; y: number }> = {
    ...subModel.positions,
  };
  const colStep = expanded ? 500 : 350;
  const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);

  for (const lv of levels) {
    const group = byLevel.get(lv) ?? [];
    let cursorY = 48;
    for (const tbl of group) {
      positions[tbl.id] = { x: 64 + lv * colStep, y: cursorY };
      cursorY += getTableCardSize(tbl, expanded).height + 44;
    }
  }

  return positions;
}

export function layoutSubModelCircular(
  tables: ErTable[],
  subModel: ErSubModel,
  expanded: boolean,
): Record<string, { x: number; y: number }> {
  const selectedIds = new Set(subModel.tableIds);
  const subTables = tables.filter((t) => selectedIds.has(t.id));
  const positions: Record<string, { x: number; y: number }> = {
    ...subModel.positions,
  };
  const count = subTables.length;
  if (count === 0) return positions;
  if (count === 1) {
    positions[subTables[0].id] = { x: 180, y: 120 };
    return positions;
  }

  const radius = Math.max(240, count * (expanded ? 95 : 70));
  const centerX = radius + 120;
  const centerY = radius + 100;

  subTables.forEach((tbl, idx) => {
    const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
    const size = getTableCardSize(tbl, expanded);
    positions[tbl.id] = {
      x: Math.max(40, Math.round(centerX + radius * Math.cos(angle) - size.width / 2)),
      y: Math.max(40, Math.round(centerY + radius * Math.sin(angle) - size.height / 2)),
    };
  });

  return positions;
}

export function formatUpdateScript(
  projectName: string,
  dialect: DbDialect,
  pendingChanges: ErPendingChange[],
): string {
  const header = [
    '-- Script de atualizacao gerado pelo ER Studio',
    `-- Projeto: ${projectName}`,
    `-- Data: ${formatDateTime(new Date().toISOString())}`,
    `-- Banco: ${dialect}`,
    `-- Comandos: ${pendingChanges.length}`,
    '',
  ];

  if (pendingChanges.length === 0) {
    return [...header, '-- Nenhuma alteracao pendente.'].join('\n');
  }

  const body = pendingChanges.map(
    (c, idx) => `-- [${idx + 1}] ${c.description}\n${c.sql}`,
  );
  return [...header, ...body].join('\n\n');
}

export type FieldPresetLang = 'pt' | 'en' | 'es';

export interface LocalizedText {
  pt: string;
  en: string;
  es: string;
}

export const FIELD_PRESET_LANGUAGES: Array<{
  id: FieldPresetLang;
  label: string;
  shortLabel: string;
}> = [
  { id: 'pt', label: 'Português (padrão)', shortLabel: 'PT' },
  { id: 'en', label: 'Inglês (English)', shortLabel: 'EN' },
  { id: 'es', label: 'Espanhol (Español)', shortLabel: 'ES' },
];

export interface FieldPresetItem {
  key: string;
  name: LocalizedText;
  type: string;
  length?: string;
  nullable: boolean;
  recommended: boolean;
  hint: LocalizedText;
}

export interface FieldPresetGroup {
  id: string;
  category: LocalizedText;
  title: LocalizedText;
  summary: LocalizedText;
  basis: string;
  defaultTableName: LocalizedText;
  fields: FieldPresetItem[];
}

export const FIELD_PRESETS: FieldPresetGroup[] = [
  {
    id: 'address',
    category: { pt: 'LOCALIZAÇÃO', en: 'LOCATION', es: 'UBICACIÓN' },
    title: { pt: 'Endereço', en: 'Address', es: 'Dirección' },
    summary: {
      pt: 'Endereço postal completo no layout do CEP/DNE e padrões internacionais.',
      en: 'Complete postal address following standard international schemas.',
      es: 'Dirección postal completa conforme a estándares internacionales.',
    },
    basis: 'Correios DNE · schema.org/PostalAddress · ISO 3166-1 · IBGE',
    defaultTableName: { pt: 'ENDERECO', en: 'ADDRESS', es: 'DIRECCION' },
    fields: [
      {
        key: 'postal_code',
        name: { pt: 'cep', en: 'postal_code', es: 'codigo_postal' },
        type: 'varchar',
        length: '12',
        nullable: false,
        recommended: true,
        hint: {
          pt: 'somente dígitos, sem máscara',
          en: 'postal/ZIP code without formatting',
          es: 'código postal sin formato',
        },
      },
      {
        key: 'street_type',
        name: { pt: 'tipo_logradouro', en: 'street_type', es: 'tipo_via' },
        type: 'varchar',
        length: '20',
        nullable: true,
        recommended: false,
        hint: {
          pt: 'Rua, Avenida, Travessa',
          en: 'Street, Avenue, Boulevard',
          es: 'Calle, Avenida, Paseo',
        },
      },
      {
        key: 'street',
        name: { pt: 'logradouro', en: 'street_address', es: 'calle' },
        type: 'varchar',
        length: '150',
        nullable: false,
        recommended: true,
        hint: { pt: 'nome da via', en: 'street name', es: 'nombre de la vía' },
      },
      {
        key: 'number',
        name: { pt: 'numero', en: 'street_number', es: 'numero' },
        type: 'varchar',
        length: '12',
        nullable: false,
        recommended: true,
        hint: {
          pt: 'texto: aceita "S/N" e "123-A"',
          en: 'text: supports "N/A" and "123-A"',
          es: 'texto: admite "S/N" y "123-A"',
        },
      },
      {
        key: 'complement',
        name: { pt: 'complemento', en: 'address_line2', es: 'complemento' },
        type: 'varchar',
        length: '80',
        nullable: true,
        recommended: true,
        hint: {
          pt: 'apto, sala, bloco',
          en: 'apt, suite, unit, building',
          es: 'depto, piso, oficina',
        },
      },
      {
        key: 'district',
        name: { pt: 'bairro', en: 'neighborhood', es: 'barrio' },
        type: 'varchar',
        length: '80',
        nullable: false,
        recommended: true,
        hint: {
          pt: 'bairro ou distrito',
          en: 'neighborhood or district',
          es: 'barrio o colonia',
        },
      },
      {
        key: 'city',
        name: { pt: 'cidade', en: 'city', es: 'ciudad' },
        type: 'varchar',
        length: '100',
        nullable: false,
        recommended: true,
        hint: { pt: 'município', en: 'city or municipality', es: 'ciudad o municipio' },
      },
      {
        key: 'state',
        name: { pt: 'uf', en: 'state_code', es: 'estado_codigo' },
        type: 'char',
        length: '2',
        nullable: false,
        recommended: true,
        hint: {
          pt: 'sigla do estado (SP, RJ, MG)',
          en: 'state or province code (NY, CA)',
          es: 'sigla de provincia/estado',
        },
      },
      {
        key: 'municipality_code',
        name: { pt: 'codigo_ibge', en: 'municipality_code', es: 'codigo_municipio' },
        type: 'char',
        length: '7',
        nullable: true,
        recommended: false,
        hint: {
          pt: 'código IBGE do município',
          en: 'official municipality code',
          es: 'código oficial del municipio',
        },
      },
      {
        key: 'country_iso2',
        name: { pt: 'pais_iso2', en: 'country_iso2', es: 'pais_iso2' },
        type: 'char',
        length: '2',
        nullable: true,
        recommended: false,
        hint: { pt: 'BR, US, ES', en: 'ISO 3166-1 alpha-2 (US, BR)', es: 'ISO 3166-1 alfa-2 (ES, MX, BR)' },
      },
    ],
  },
  {
    id: 'geo',
    category: { pt: 'LOCALIZAÇÃO', en: 'LOCATION', es: 'UBICACIÓN' },
    title: { pt: 'Geolocalização', en: 'Geolocation', es: 'Geolocalización' },
    summary: {
      pt: 'Coordenadas geográficas com precisão adequada para mapas e logística.',
      en: 'Geographic coordinates with precision suitable for mapping and logistics.',
      es: 'Coordenadas geográficas con precisión adecuada para mapas y logística.',
    },
    basis: 'WGS84 · GPS decimal · Geohash',
    defaultTableName: { pt: 'GEOLOCALIZACAO', en: 'GEOLOCATION', es: 'GEOLOCALIZACION' },
    fields: [
      {
        key: 'latitude',
        name: { pt: 'latitude', en: 'latitude', es: 'latitud' },
        type: 'decimal',
        length: '10,7',
        nullable: false,
        recommended: true,
        hint: { pt: 'coordenada norte/sul', en: 'north/south coordinate', es: 'coordenada norte/sur' },
      },
      {
        key: 'longitude',
        name: { pt: 'longitude', en: 'longitude', es: 'longitud' },
        type: 'decimal',
        length: '10,7',
        nullable: false,
        recommended: true,
        hint: { pt: 'coordenada leste/oeste', en: 'east/west coordinate', es: 'coordenada este/oeste' },
      },
      {
        key: 'altitude',
        name: { pt: 'altitude_metros', en: 'altitude_meters', es: 'altitud_metros' },
        type: 'decimal',
        length: '8,2',
        nullable: true,
        recommended: false,
        hint: { pt: 'elevação em metros', en: 'elevation in meters', es: 'elevación en metros' },
      },
      {
        key: 'accuracy',
        name: { pt: 'precisao_metros', en: 'accuracy_meters', es: 'precision_metros' },
        type: 'int',
        nullable: true,
        recommended: false,
        hint: { pt: 'raio de acurácia do GPS', en: 'GPS accuracy radius', es: 'radio de precisión GPS' },
      },
      {
        key: 'geohash',
        name: { pt: 'geohash', en: 'geohash', es: 'geohash' },
        type: 'varchar',
        length: '12',
        nullable: true,
        recommended: false,
        hint: { pt: 'índice espacial compacto', en: 'compact spatial index', es: 'índice espacial compacto' },
      },
    ],
  },
  {
    id: 'person_pf',
    category: { pt: 'PESSOAS', en: 'PEOPLE', es: 'PERSONAS' },
    title: {
      pt: 'Dados pessoais (PF)',
      en: 'Personal Data (Individual)',
      es: 'Datos Personales (PF)',
    },
    summary: {
      pt: 'Identificação de pessoa física, com campos de cadastro e KYC.',
      en: 'Individual person identification, registration and KYC attributes.',
      es: 'Identificación de persona física con campos de registro y KYC.',
    },
    basis: 'Receita Federal · KYC · Cadastro PF',
    defaultTableName: { pt: 'PESSOA_FISICA', en: 'INDIVIDUAL', es: 'PERSONA_FISICA' },
    fields: [
      {
        key: 'full_name',
        name: { pt: 'nome_completo', en: 'full_name', es: 'nombre_completo' },
        type: 'varchar',
        length: '180',
        nullable: false,
        recommended: true,
        hint: { pt: 'nome civil completo', en: 'legal full name', es: 'nombre legal completo' },
      },
      {
        key: 'social_name',
        name: { pt: 'nome_social', en: 'preferred_name', es: 'nombre_preferido' },
        type: 'varchar',
        length: '120',
        nullable: true,
        recommended: false,
        hint: { pt: 'nome de tratamento', en: 'preferred display name', es: 'nombre de trato preferido' },
      },
      {
        key: 'tax_id',
        name: { pt: 'cpf', en: 'tax_id', es: 'documento_fiscal' },
        type: 'varchar',
        length: '20',
        nullable: false,
        recommended: true,
        hint: { pt: 'somente dígitos', en: 'SSN / national tax ID', es: 'identificador fiscal sin formato' },
      },
      {
        key: 'birth_date',
        name: { pt: 'data_nascimento', en: 'birth_date', es: 'fecha_nacimiento' },
        type: 'date',
        nullable: true,
        recommended: true,
        hint: { pt: 'YYYY-MM-DD', en: 'YYYY-MM-DD', es: 'YYYY-MM-DD' },
      },
      {
        key: 'email',
        name: { pt: 'email', en: 'email', es: 'correo_electronico' },
        type: 'varchar',
        length: '160',
        nullable: true,
        recommended: true,
        hint: { pt: 'e-mail principal', en: 'primary email address', es: 'correo electrónico principal' },
      },
      {
        key: 'phone',
        name: { pt: 'telefone', en: 'phone_number', es: 'telefono' },
        type: 'varchar',
        length: '20',
        nullable: true,
        recommended: true,
        hint: { pt: 'DDD + número', en: 'E.164 phone number', es: 'código de área + número' },
      },
      {
        key: 'nationality',
        name: { pt: 'nacionalidade', en: 'nationality', es: 'nacionalidad' },
        type: 'varchar',
        length: '60',
        nullable: true,
        recommended: false,
        hint: { pt: 'país de cidadania', en: 'country of citizenship', es: 'país de nacionalidad' },
      },
      {
        key: 'mother_name',
        name: { pt: 'nome_mae', en: 'mother_name', es: 'nombre_madre' },
        type: 'varchar',
        length: '180',
        nullable: true,
        recommended: false,
        hint: { pt: 'validação cadastral / KYC', en: 'KYC verification field', es: 'validación KYC' },
      },
    ],
  },
  {
    id: 'company_pj',
    category: { pt: 'PESSOAS', en: 'PEOPLE', es: 'PERSONAS' },
    title: {
      pt: 'Dados da empresa (PJ)',
      en: 'Company Data (Legal Entity)',
      es: 'Datos de la Empresa (PJ)',
    },
    summary: {
      pt: 'Identificação cadastral e fiscal de pessoa jurídica.',
      en: 'Corporate legal entity registration and tax identification fields.',
      es: 'Identificación registral y fiscal de persona jurídica.',
    },
    basis: 'Receita Federal · CNPJ · ISO 17442 (LEI)',
    defaultTableName: { pt: 'PESSOA_JURIDICA', en: 'COMPANY', es: 'EMPRESA' },
    fields: [
      {
        key: 'legal_name',
        name: { pt: 'razao_social', en: 'legal_name', es: 'razon_social' },
        type: 'varchar',
        length: '200',
        nullable: false,
        recommended: true,
        hint: { pt: 'denominação oficial', en: 'registered legal name', es: 'denominación oficial' },
      },
      {
        key: 'trade_name',
        name: { pt: 'nome_fantasia', en: 'trade_name', es: 'nombre_comercial' },
        type: 'varchar',
        length: '160',
        nullable: true,
        recommended: true,
        hint: { pt: 'nome comercial', en: 'DBA / brand name', es: 'nombre de fantasía' },
      },
      {
        key: 'company_tax_id',
        name: { pt: 'cnpj', en: 'company_tax_id', es: 'identificacion_fiscal' },
        type: 'varchar',
        length: '20',
        nullable: false,
        recommended: true,
        hint: { pt: 'somente dígitos', en: 'EIN / VAT / corporate tax ID', es: 'CUIT / RFC / CIF / NIF' },
      },
      {
        key: 'state_reg',
        name: { pt: 'inscricao_estadual', en: 'state_registration', es: 'inscripcion_estatal' },
        type: 'varchar',
        length: '30',
        nullable: true,
        recommended: false,
        hint: { pt: 'IE quando aplicável', en: 'state tax registration', es: 'registro tributario estatal' },
      },
      {
        key: 'municipal_reg',
        name: { pt: 'inscricao_municipal', en: 'municipal_registration', es: 'inscripcion_municipal' },
        type: 'varchar',
        length: '30',
        nullable: true,
        recommended: false,
        hint: { pt: 'IM para prestadores de serviço', en: 'local municipal tax ID', es: 'registro municipal' },
      },
      {
        key: 'industry_code',
        name: { pt: 'cnae_principal', en: 'industry_code', es: 'codigo_actividad' },
        type: 'varchar',
        length: '10',
        nullable: true,
        recommended: false,
        hint: { pt: 'código CNAE', en: 'NAICS / SIC code', es: 'código de actividad económica' },
      },
      {
        key: 'founded_at',
        name: { pt: 'data_abertura', en: 'incorporation_date', es: 'fecha_constitucion' },
        type: 'date',
        nullable: true,
        recommended: false,
        hint: { pt: 'data de constituição', en: 'date of incorporation', es: 'fecha de constitución' },
      },
    ],
  },
  {
    id: 'contact',
    category: { pt: 'PESSOAS', en: 'PEOPLE', es: 'PERSONAS' },
    title: {
      pt: 'Contato e Comunicação',
      en: 'Contact & Communication',
      es: 'Contacto y Comunicación',
    },
    summary: {
      pt: 'Canais de contato comercial, notificações e preferências de comunicação.',
      en: 'Communication channels, messaging handles and opt-in preferences.',
      es: 'Canales de contacto comercial, mensajería y preferencias.',
    },
    basis: 'E.164 · RFC 5322 · CRM',
    defaultTableName: { pt: 'CONTATO', en: 'CONTACT', es: 'CONTACTO' },
    fields: [
      {
        key: 'email_primary',
        name: { pt: 'email_principal', en: 'primary_email', es: 'correo_principal' },
        type: 'varchar',
        length: '160',
        nullable: false,
        recommended: true,
        hint: { pt: 'e-mail principal de contato', en: 'primary contact email', es: 'correo principal de contacto' },
      },
      {
        key: 'mobile_phone',
        name: { pt: 'celular', en: 'mobile_phone', es: 'telefono_movil' },
        type: 'varchar',
        length: '20',
        nullable: true,
        recommended: true,
        hint: { pt: 'telefone celular E.164', en: 'mobile phone E.164', es: 'teléfono móvil E.164' },
      },
      {
        key: 'landline',
        name: { pt: 'telefone_fixo', en: 'landline_phone', es: 'telefono_fijo' },
        type: 'varchar',
        length: '20',
        nullable: true,
        recommended: false,
        hint: { pt: 'telefone comercial/fixo', en: 'office landline number', es: 'teléfono fijo/oficina' },
      },
      {
        key: 'whatsapp',
        name: { pt: 'whatsapp', en: 'whatsapp_number', es: 'numero_whatsapp' },
        type: 'varchar',
        length: '20',
        nullable: true,
        recommended: true,
        hint: { pt: 'número habilitado no WhatsApp', en: 'WhatsApp enabled number', es: 'número habilitado en WhatsApp' },
      },
      {
        key: 'website',
        name: { pt: 'website_url', en: 'website_url', es: 'sitio_web_url' },
        type: 'varchar',
        length: '255',
        nullable: true,
        recommended: false,
        hint: { pt: 'site institucional', en: 'website URL', es: 'URL del sitio web' },
      },
      {
        key: 'opt_in_notif',
        name: { pt: 'aceita_notificacoes', en: 'accepts_notifications', es: 'acepta_notificaciones' },
        type: 'boolean',
        nullable: false,
        recommended: true,
        hint: { pt: 'opt-in de comunicações', en: 'notification opt-in flag', es: 'preferencia de notificaciones' },
      },
    ],
  },
  {
    id: 'documents',
    category: { pt: 'PESSOAS', en: 'PEOPLE', es: 'PERSONAS' },
    title: {
      pt: 'Documentos e Identificação',
      en: 'Identity Documents',
      es: 'Documentos de Identidad',
    },
    summary: {
      pt: 'Campos para registro de RG, CNH, Passaporte ou documentos oficiais.',
      en: 'Fields for national ID, driver license, passport or official documents.',
      es: 'Campos para DNI, pasaporte, licencia u otros documentos oficiales.',
    },
    basis: 'ICAO 9303 · Cadastro Civil',
    defaultTableName: { pt: 'DOCUMENTO_IDENTIDADE', en: 'IDENTITY_DOCUMENT', es: 'DOCUMENTO_IDENTIDAD' },
    fields: [
      {
        key: 'doc_type',
        name: { pt: 'tipo_documento', en: 'document_type', es: 'tipo_documento' },
        type: 'varchar',
        length: '20',
        nullable: false,
        recommended: true,
        hint: { pt: 'RG, CNH, PASSAPORTE, RNE', en: 'PASSPORT, ID_CARD, DRIVER_LICENSE', es: 'DNI, PASAPORTE, LICENCIA' },
      },
      {
        key: 'doc_number',
        name: { pt: 'numero_documento', en: 'document_number', es: 'numero_documento' },
        type: 'varchar',
        length: '40',
        nullable: false,
        recommended: true,
        hint: { pt: 'número sem formatação', en: 'raw document number', es: 'número sin formato' },
      },
      {
        key: 'issuer',
        name: { pt: 'orgao_emissor', en: 'issuing_authority', es: 'entidad_emisora' },
        type: 'varchar',
        length: '40',
        nullable: true,
        recommended: true,
        hint: { pt: 'SSP, DETRAN, PF', en: 'issuing government agency', es: 'organismo emisor' },
      },
      {
        key: 'issue_country',
        name: { pt: 'pais_emissor', en: 'issuing_country', es: 'pais_emisor' },
        type: 'char',
        length: '2',
        nullable: true,
        recommended: false,
        hint: { pt: 'ISO 3166-1 alfa-2', en: 'ISO 3166-1 alpha-2', es: 'ISO 3166-1 alfa-2' },
      },
      {
        key: 'issued_at',
        name: { pt: 'data_emissao', en: 'issue_date', es: 'fecha_emision' },
        type: 'date',
        nullable: true,
        recommended: true,
        hint: { pt: 'data de expedição', en: 'date of issue', es: 'fecha de emisión' },
      },
      {
        key: 'expires_at',
        name: { pt: 'data_validade', en: 'expiration_date', es: 'fecha_vencimiento' },
        type: 'date',
        nullable: true,
        recommended: true,
        hint: { pt: 'data de expiração', en: 'document expiry date', es: 'fecha de caducidad' },
      },
    ],
  },
  {
    id: 'bank_account',
    category: { pt: 'FINANCEIRO', en: 'FINANCIAL', es: 'FINANCIERO' },
    title: {
      pt: 'Dados Bancários',
      en: 'Bank Account',
      es: 'Datos Bancarios',
    },
    summary: {
      pt: 'Conta corrente/poupança, agência, ISPB, chave PIX e padrões IBAN/SWIFT.',
      en: 'Checking/savings account, routing number, IBAN, SWIFT and instant payment key.',
      es: 'Cuenta bancaria, sucursal, CBU/IBAN, SWIFT y clave de pago inmediato.',
    },
    basis: 'BACEN STR/PIX · ISO 13616 (IBAN) · ISO 9362 (BIC)',
    defaultTableName: { pt: 'CONTA_BANCARIA', en: 'BANK_ACCOUNT', es: 'CUENTA_BANCARIA' },
    fields: [
      {
        key: 'bank_code',
        name: { pt: 'codigo_banco', en: 'bank_code', es: 'codigo_banco' },
        type: 'varchar',
        length: '10',
        nullable: false,
        recommended: true,
        hint: { pt: 'código COMPE / banco', en: 'bank clearing code', es: 'código de entidad bancaria' },
      },
      {
        key: 'ispb',
        name: { pt: 'ispb', en: 'routing_number', es: 'codigo_ruta' },
        type: 'varchar',
        length: '16',
        nullable: true,
        recommended: true,
        hint: { pt: 'ISPB 8 dígitos (BACEN)', en: 'ABA / routing / sort code', es: 'código de enrutamiento' },
      },
      {
        key: 'branch',
        name: { pt: 'agencia', en: 'branch_number', es: 'sucursal' },
        type: 'varchar',
        length: '10',
        nullable: false,
        recommended: true,
        hint: { pt: 'número da agência', en: 'bank branch number', es: 'número de sucursal' },
      },
      {
        key: 'account_number',
        name: { pt: 'numero_conta', en: 'account_number', es: 'numero_cuenta' },
        type: 'varchar',
        length: '20',
        nullable: false,
        recommended: true,
        hint: { pt: 'número da conta sem dígito', en: 'bank account number', es: 'número de cuenta' },
      },
      {
        key: 'account_digit',
        name: { pt: 'digito_conta', en: 'account_check_digit', es: 'digito_verificador' },
        type: 'varchar',
        length: '2',
        nullable: true,
        recommended: true,
        hint: { pt: 'dígito verificador', en: 'account check digit', es: 'dígito de control' },
      },
      {
        key: 'account_type',
        name: { pt: 'tipo_conta', en: 'account_type', es: 'tipo_cuenta' },
        type: 'varchar',
        length: '20',
        nullable: false,
        recommended: true,
        hint: { pt: 'CORRENTE, POUPANCA, PAGAMENTO', en: 'CHECKING, SAVINGS', es: 'CORRIENTE, AHORRO' },
      },
      {
        key: 'instant_key',
        name: { pt: 'chave_pix', en: 'instant_payment_key', es: 'clave_pago_inmediato' },
        type: 'varchar',
        length: '120',
        nullable: true,
        recommended: false,
        hint: { pt: 'CPF/CNPJ, e-mail, celular ou EVP', en: 'instant payment alias/key', es: 'alias o clave de pago' },
      },
      {
        key: 'iban_swift',
        name: { pt: 'iban', en: 'iban', es: 'iban' },
        type: 'varchar',
        length: '34',
        nullable: true,
        recommended: false,
        hint: { pt: 'transferências internacionais', en: 'international IBAN', es: 'IBAN internacional' },
      },
    ],
  },
  {
    id: 'payment',
    category: { pt: 'FINANCEIRO', en: 'FINANCIAL', es: 'FINANCIERO' },
    title: {
      pt: 'Pagamento e Cobrança',
      en: 'Payment & Billing',
      es: 'Pago y Facturación',
    },
    summary: {
      pt: 'Controle de títulos, vencimento, liquidação, método de pagamento e status.',
      en: 'Payment lifecycle: due date, settlement, method, amount and status.',
      es: 'Ciclo de pago: vencimiento, liquidación, medio de pago y estado.',
    },
    basis: 'ISO 4217 · Contas a Pagar / Receber',
    defaultTableName: { pt: 'PAGAMENTO', en: 'PAYMENT', es: 'PAGO' },
    fields: [
      {
        key: 'payment_method',
        name: { pt: 'forma_pagamento', en: 'payment_method', es: 'metodo_pago' },
        type: 'varchar',
        length: '30',
        nullable: false,
        recommended: true,
        hint: { pt: 'PIX, BOLETO, TED, CARTAO', en: 'CARD, ACH, WIRE, PIX', es: 'TARJETA, TRANSFERENCIA, EFECTIVO' },
      },
      {
        key: 'payment_status',
        name: { pt: 'status_pagamento', en: 'payment_status', es: 'estado_pago' },
        type: 'varchar',
        length: '25',
        nullable: false,
        recommended: true,
        hint: { pt: 'PENDENTE, PAGO, CANCELADO', en: 'PENDING, PAID, FAILED', es: 'PENDIENTE, PAGADO, ANULADO' },
      },
      {
        key: 'amount',
        name: { pt: 'valor_original', en: 'amount', es: 'monto_original' },
        type: 'decimal',
        length: '15,2',
        nullable: false,
        recommended: true,
        hint: { pt: 'valor nominal do lançamento', en: 'gross payment amount', es: 'importe bruto del pago' },
      },
      {
        key: 'paid_amount',
        name: { pt: 'valor_pago', en: 'paid_amount', es: 'monto_pagado' },
        type: 'decimal',
        length: '15,2',
        nullable: true,
        recommended: true,
        hint: { pt: 'valor efetivamente liquidado', en: 'settled amount', es: 'importe efectivamente pagado' },
      },
      {
        key: 'currency',
        name: { pt: 'moeda_iso3', en: 'currency_code', es: 'codigo_moneda' },
        type: 'char',
        length: '3',
        nullable: false,
        recommended: true,
        hint: { pt: 'BRL, USD, EUR', en: 'ISO 4217 (USD, EUR, BRL)', es: 'ISO 4217 (EUR, USD, MXN)' },
      },
      {
        key: 'due_date',
        name: { pt: 'data_vencimento', en: 'due_date', es: 'fecha_vencimiento' },
        type: 'date',
        nullable: false,
        recommended: true,
        hint: { pt: 'data limite de pagamento', en: 'payment due date', es: 'fecha límite de pago' },
      },
      {
        key: 'paid_at',
        name: { pt: 'data_pagamento', en: 'paid_at', es: 'fecha_pago' },
        type: 'datetime',
        nullable: true,
        recommended: true,
        hint: { pt: 'timestamp da liquidação', en: 'settlement timestamp', es: 'fecha y hora de liquidación' },
      },
      {
        key: 'external_ref',
        name: { pt: 'codigo_transacao', en: 'transaction_ref', es: 'referencia_transaccion' },
        type: 'varchar',
        length: '100',
        nullable: true,
        recommended: false,
        hint: { pt: 'NSU / ID no gateway', en: 'gateway transaction ID', es: 'ID de transacción externa' },
      },
    ],
  },
  {
    id: 'monetary',
    category: { pt: 'FINANCEIRO', en: 'FINANCIAL', es: 'FINANCIERO' },
    title: {
      pt: 'Valores Monetários e Câmbio',
      en: 'Monetary Amounts & FX',
      es: 'Valores Monetarios y Cambio',
    },
    summary: {
      pt: 'Composição de valor bruto, descontos, impostos, valor líquido e taxa de câmbio.',
      en: 'Gross amount, discount, tax, net total, currency and exchange rate.',
      es: 'Importe bruto, descuento, impuestos, neto, moneda y tipo de cambio.',
    },
    basis: 'ISO 4217 · Precisão contábil DECIMAL',
    defaultTableName: { pt: 'RESUMO_FINANCEIRO', en: 'MONETARY_SUMMARY', es: 'RESUMEN_FINANCIERO' },
    fields: [
      {
        key: 'gross_amount',
        name: { pt: 'valor_bruto', en: 'gross_amount', es: 'monto_bruto' },
        type: 'decimal',
        length: '15,2',
        nullable: false,
        recommended: true,
        hint: { pt: 'valor antes de descontos', en: 'amount before discounts', es: 'importe antes de descuentos' },
      },
      {
        key: 'discount_amount',
        name: { pt: 'valor_desconto', en: 'discount_amount', es: 'monto_descuento' },
        type: 'decimal',
        length: '15,2',
        nullable: false,
        recommended: true,
        hint: { pt: 'desconto concedido', en: 'total discount applied', es: 'descuento aplicado' },
      },
      {
        key: 'tax_amount',
        name: { pt: 'valor_imposto', en: 'tax_amount', es: 'monto_impuesto' },
        type: 'decimal',
        length: '15,2',
        nullable: false,
        recommended: true,
        hint: { pt: 'soma de tributos', en: 'total taxes', es: 'total de impuestos' },
      },
      {
        key: 'net_amount',
        name: { pt: 'valor_liquido', en: 'net_amount', es: 'monto_neto' },
        type: 'decimal',
        length: '15,2',
        nullable: false,
        recommended: true,
        hint: { pt: 'valor final líquido', en: 'final net amount', es: 'importe neto final' },
      },
      {
        key: 'currency_iso',
        name: { pt: 'moeda', en: 'currency_code', es: 'moneda' },
        type: 'char',
        length: '3',
        nullable: false,
        recommended: true,
        hint: { pt: 'BRL, USD, EUR', en: 'ISO 4217 currency code', es: 'código ISO 4217' },
      },
      {
        key: 'fx_rate',
        name: { pt: 'taxa_cambio', en: 'exchange_rate', es: 'tipo_cambio' },
        type: 'decimal',
        length: '12,6',
        nullable: true,
        recommended: false,
        hint: { pt: 'cotação aplicada', en: 'FX conversion rate', es: 'tasa de cambio aplicada' },
      },
    ],
  },
  {
    id: 'invoice_tax',
    category: { pt: 'FINANCEIRO', en: 'FINANCIAL', es: 'FINANCIERO' },
    title: {
      pt: 'Nota Fiscal / Faturamento',
      en: 'Invoice & Tax Document',
      es: 'Factura y Documento Fiscal',
    },
    summary: {
      pt: 'Metadados de documento fiscal eletrônico (NF-e / NFS-e / Invoice).',
      en: 'Electronic invoice metadata, access key, series and fiscal status.',
      es: 'Metadatos de factura electrónica, serie, folio fiscal y estado.',
    },
    basis: 'NF-e · NFS-e · CFDI · UBL 2.1',
    defaultTableName: { pt: 'NOTA_FISCAL', en: 'INVOICE', es: 'FACTURA' },
    fields: [
      {
        key: 'invoice_number',
        name: { pt: 'numero_nf', en: 'invoice_number', es: 'numero_factura' },
        type: 'varchar',
        length: '30',
        nullable: false,
        recommended: true,
        hint: { pt: 'número sequencial fiscal', en: 'sequential invoice number', es: 'número correlativo' },
      },
      {
        key: 'invoice_series',
        name: { pt: 'serie_nf', en: 'invoice_series', es: 'serie_factura' },
        type: 'varchar',
        length: '10',
        nullable: true,
        recommended: true,
        hint: { pt: 'série do documento', en: 'document series', es: 'serie del comprobante' },
      },
      {
        key: 'access_key',
        name: { pt: 'chave_acesso', en: 'fiscal_access_key', es: 'folio_fiscal' },
        type: 'varchar',
        length: '64',
        nullable: true,
        recommended: true,
        hint: { pt: 'chave de 44 dígitos (NF-e)', en: 'electronic tax key / UUID', es: 'UUID o folio fiscal' },
      },
      {
        key: 'issued_at',
        name: { pt: 'data_emissao', en: 'issue_date', es: 'fecha_emision' },
        type: 'datetime',
        nullable: false,
        recommended: true,
        hint: { pt: 'data/hora de autorização', en: 'invoice issue timestamp', es: 'fecha y hora de emisión' },
      },
      {
        key: 'fiscal_status',
        name: { pt: 'status_fiscal', en: 'fiscal_status', es: 'estado_fiscal' },
        type: 'varchar',
        length: '25',
        nullable: false,
        recommended: true,
        hint: { pt: 'AUTORIZADA, CANCELADA, DENEGADA', en: 'AUTHORIZED, VOIDED', es: 'AUTORIZADA, ANULADA' },
      },
      {
        key: 'xml_url',
        name: { pt: 'url_xml', en: 'xml_document_url', es: 'url_xml' },
        type: 'varchar',
        length: '255',
        nullable: true,
        recommended: false,
        hint: { pt: 'link para download do XML', en: 'stored XML file URL', es: 'enlace al archivo XML' },
      },
    ],
  },
  {
    id: 'audit',
    category: { pt: 'CONTROLE E GOVERNANÇA', en: 'GOVERNANCE & OPS', es: 'CONTROL Y GOBIERNO' },
    title: {
      pt: 'Auditoria e Soft Delete',
      en: 'Audit & Soft Delete',
      es: 'Auditoría y Borrado Lógico',
    },
    summary: {
      pt: 'Colunas padrão de rastreabilidade de criação, atualização e exclusão lógica.',
      en: 'Standard columns for creation, modification, actor tracking and soft delete.',
      es: 'Columnas estándar de trazabilidad de creación, actualización y borrado lógico.',
    },
    basis: 'Boas práticas de banco relacional',
    defaultTableName: { pt: 'AUDITORIA', en: 'AUDIT_LOG', es: 'AUDITORIA' },
    fields: [
      {
        key: 'created_at',
        name: { pt: 'criado_em', en: 'created_at', es: 'creado_en' },
        type: 'datetime',
        nullable: false,
        recommended: true,
        hint: { pt: 'data/hora de criação', en: 'creation timestamp (UTC)', es: 'fecha y hora de creación' },
      },
      {
        key: 'updated_at',
        name: { pt: 'atualizado_em', en: 'updated_at', es: 'actualizado_en' },
        type: 'datetime',
        nullable: false,
        recommended: true,
        hint: { pt: 'última atualização', en: 'last modification timestamp', es: 'última modificación' },
      },
      {
        key: 'created_by',
        name: { pt: 'criado_por', en: 'created_by', es: 'creado_por' },
        type: 'varchar',
        length: '120',
        nullable: true,
        recommended: true,
        hint: { pt: 'usuário criador', en: 'creator user ID/email', es: 'usuario creador' },
      },
      {
        key: 'updated_by',
        name: { pt: 'atualizado_por', en: 'updated_by', es: 'actualizado_por' },
        type: 'varchar',
        length: '120',
        nullable: true,
        recommended: false,
        hint: { pt: 'último editor', en: 'last editor user ID/email', es: 'último usuario editor' },
      },
      {
        key: 'is_deleted',
        name: { pt: 'excluido', en: 'is_deleted', es: 'eliminado' },
        type: 'boolean',
        nullable: false,
        recommended: true,
        hint: { pt: 'flag de exclusão lógica', en: 'soft delete flag', es: 'marca de borrado lógico' },
      },
      {
        key: 'deleted_at',
        name: { pt: 'excluido_em', en: 'deleted_at', es: 'eliminado_en' },
        type: 'datetime',
        nullable: true,
        recommended: false,
        hint: { pt: 'momento da exclusão lógica', en: 'soft delete timestamp', es: 'fecha de borrado lógico' },
      },
    ],
  },
  {
    id: 'auth_security',
    category: { pt: 'CONTROLE E GOVERNANÇA', en: 'GOVERNANCE & OPS', es: 'CONTROL Y GOBIERNO' },
    title: {
      pt: 'Autenticação e Segurança',
      en: 'Authentication & Security',
      es: 'Autenticación y Seguridad',
    },
    summary: {
      pt: 'Credenciais seguras, MFA, controle de bloqueio e rastreio de último acesso.',
      en: 'Password hash, MFA state, lockout controls and last login tracking.',
      es: 'Hash de contraseña, MFA, bloqueo de cuenta y último acceso.',
    },
    basis: 'OWASP ASVS · OAuth 2.0 / OIDC',
    defaultTableName: { pt: 'USUARIO_ACESSO', en: 'USER_AUTH', es: 'USUARIO_ACCESO' },
    fields: [
      {
        key: 'username',
        name: { pt: 'login_usuario', en: 'username', es: 'nombre_usuario' },
        type: 'varchar',
        length: '120',
        nullable: false,
        recommended: true,
        hint: { pt: 'identificador único de login', en: 'unique login identifier', es: 'identificador único de acceso' },
      },
      {
        key: 'password_hash',
        name: { pt: 'senha_hash', en: 'password_hash', es: 'hash_contrasena' },
        type: 'varchar',
        length: '255',
        nullable: true,
        recommended: true,
        hint: { pt: 'Argon2 / scrypt / bcrypt', en: 'Argon2 / scrypt / bcrypt hash', es: 'hash Argon2 / scrypt / bcrypt' },
      },
      {
        key: 'auth_provider',
        name: { pt: 'provedor_auth', en: 'auth_provider', es: 'proveedor_auth' },
        type: 'varchar',
        length: '30',
        nullable: false,
        recommended: true,
        hint: { pt: 'LOCAL, GOOGLE, SAML', en: 'LOCAL, GOOGLE, OIDC, SAML', es: 'LOCAL, GOOGLE, SAML' },
      },
      {
        key: 'mfa_enabled',
        name: { pt: 'mfa_ativo', en: 'mfa_enabled', es: 'mfa_activo' },
        type: 'boolean',
        nullable: false,
        recommended: true,
        hint: { pt: 'autenticação em 2 fatores', en: 'two-factor authentication flag', es: 'doble factor habilitado' },
      },
      {
        key: 'failed_attempts',
        name: { pt: 'tentativas_falhas', en: 'failed_login_attempts', es: 'intentos_fallidos' },
        type: 'int',
        nullable: false,
        recommended: false,
        hint: { pt: 'contador anti força bruta', en: 'brute-force lockout counter', es: 'contador de bloqueio' },
      },
      {
        key: 'locked_until',
        name: { pt: 'bloqueado_ate', en: 'locked_until', es: 'bloqueado_hasta' },
        type: 'datetime',
        nullable: true,
        recommended: false,
        hint: { pt: 'expiração do bloqueio', en: 'temporary lock expiration', es: 'fin del bloqueo temporal' },
      },
      {
        key: 'last_login',
        name: { pt: 'ultimo_acesso_em', en: 'last_login_at', es: 'ultimo_acceso_en' },
        type: 'datetime',
        nullable: true,
        recommended: true,
        hint: { pt: 'data/hora do último login', en: 'last successful sign-in', es: 'último inicio de sesión' },
      },
    ],
  },
  {
    id: 'privacy_lgpd',
    category: { pt: 'CONTROLE E GOVERNANÇA', en: 'GOVERNANCE & OPS', es: 'CONTROL Y GOBIERNO' },
    title: {
      pt: 'LGPD e Consentimento',
      en: 'Privacy & Consent (GDPR)',
      es: 'Privacidad y Consentimiento',
    },
    summary: {
      pt: 'Registro auditável de aceite de termos, finalidade e revogação de consentimento.',
      en: 'Auditable record of policy acceptance, purpose and consent revocation.',
      es: 'Registro auditable de aceptación de términos, finalidad y revocación.',
    },
    basis: 'LGPD (Lei 13.709/18) · GDPR',
    defaultTableName: { pt: 'CONSENTIMENTO_PRIVACIDADE', en: 'PRIVACY_CONSENT', es: 'CONSENTIMIENTO_PRIVACIDAD' },
    fields: [
      {
        key: 'policy_version',
        name: { pt: 'versao_termo', en: 'policy_version', es: 'version_terminos' },
        type: 'varchar',
        length: '20',
        nullable: false,
        recommended: true,
        hint: { pt: 'versão do termo aceito', en: 'accepted terms version', es: 'versión de términos aceptada' },
      },
      {
        key: 'purpose',
        name: { pt: 'finalidade', en: 'consent_purpose', es: 'finalidad' },
        type: 'varchar',
        length: '80',
        nullable: false,
        recommended: true,
        hint: { pt: 'MARKETING, ANALYTICS, CONTRATO', en: 'MARKETING, ANALYTICS, CONTRACT', es: 'MARKETING, ANALITICA, CONTRATO' },
      },
      {
        key: 'granted',
        name: { pt: 'consentimento_concedido', en: 'consent_granted', es: 'consentimiento_otorgado' },
        type: 'boolean',
        nullable: false,
        recommended: true,
        hint: { pt: 'status atual do aceite', en: 'current consent status', es: 'estado actual del consentimiento' },
      },
      {
        key: 'granted_at',
        name: { pt: 'aceito_em', en: 'granted_at', es: 'aceptado_en' },
        type: 'datetime',
        nullable: false,
        recommended: true,
        hint: { pt: 'data/hora do aceite', en: 'acceptance timestamp', es: 'fecha de aceptación' },
      },
      {
        key: 'revoked_at',
        name: { pt: 'revogado_em', en: 'revoked_at', es: 'revocado_en' },
        type: 'datetime',
        nullable: true,
        recommended: true,
        hint: { pt: 'data/hora de revogação', en: 'revocation timestamp', es: 'fecha de revocación' },
      },
      {
        key: 'origin_ip',
        name: { pt: 'ip_origem', en: 'source_ip', es: 'ip_origen' },
        type: 'varchar',
        length: '45',
        nullable: true,
        recommended: false,
        hint: { pt: 'IPv4/IPv6 da prova de aceite', en: 'IPv4/IPv6 evidence address', es: 'IPv4/IPv6 de evidencia' },
      },
    ],
  },
  {
    id: 'attachment',
    category: { pt: 'CONTROLE E GOVERNANÇA', en: 'GOVERNANCE & OPS', es: 'CONTROL Y GOBIERNO' },
    title: {
      pt: 'Anexo / Arquivo',
      en: 'File Attachment',
      es: 'Archivo Adjunto',
    },
    summary: {
      pt: 'Metadados de arquivos armazenados em object storage (S3/GCS/Blob).',
      en: 'Metadata for files stored in object storage (S3/GCS/Blob).',
      es: 'Metadatos de archivos almacenados en object storage (S3/GCS/Blob).',
    },
    basis: 'MIME RFC 2046 · SHA-256 · Cloud Storage',
    defaultTableName: { pt: 'ARQUIVO_ANEXO', en: 'FILE_ATTACHMENT', es: 'ARCHIVO_ADJUNTO' },
    fields: [
      {
        key: 'file_name',
        name: { pt: 'nome_arquivo', en: 'file_name', es: 'nombre_archivo' },
        type: 'varchar',
        length: '255',
        nullable: false,
        recommended: true,
        hint: { pt: 'nome original do arquivo', en: 'original file name', es: 'nombre original del archivo' },
      },
      {
        key: 'mime_type',
        name: { pt: 'tipo_mime', en: 'mime_type', es: 'tipo_mime' },
        type: 'varchar',
        length: '100',
        nullable: false,
        recommended: true,
        hint: { pt: 'application/pdf, image/png', en: 'MIME content type', es: 'tipo de contenido MIME' },
      },
      {
        key: 'size_bytes',
        name: { pt: 'tamanho_bytes', en: 'file_size_bytes', es: 'tamano_bytes' },
        type: 'bigint',
        nullable: false,
        recommended: true,
        hint: { pt: 'tamanho em bytes', en: 'size in bytes', es: 'tamaño en bytes' },
      },
      {
        key: 'storage_key',
        name: { pt: 'caminho_storage', en: 'storage_key', es: 'ruta_almacenamiento' },
        type: 'varchar',
        length: '500',
        nullable: false,
        recommended: true,
        hint: { pt: 'chave/URL no bucket', en: 'bucket key or URI', es: 'clave o ruta en el bucket' },
      },
      {
        key: 'checksum',
        name: { pt: 'hash_sha256', en: 'checksum_sha256', es: 'hash_sha256' },
        type: 'char',
        length: '64',
        nullable: true,
        recommended: false,
        hint: { pt: 'integridade / deduplicação', en: 'integrity & deduplication', es: 'integridad y deduplicación' },
      },
      {
        key: 'uploaded_at',
        name: { pt: 'enviado_em', en: 'uploaded_at', es: 'subido_en' },
        type: 'datetime',
        nullable: false,
        recommended: true,
        hint: { pt: 'data/hora do upload', en: 'upload timestamp', es: 'fecha y hora de carga' },
      },
    ],
  },
  {
    id: 'workflow',
    category: { pt: 'CONTROLE E GOVERNANÇA', en: 'GOVERNANCE & OPS', es: 'CONTROL Y GOBIERNO' },
    title: {
      pt: 'Workflow e Aprovação',
      en: 'Workflow & Approval',
      es: 'Flujo de Aprobación',
    },
    summary: {
      pt: 'Controle de alçadas, status de aprovação, aprovador e justificativa.',
      en: 'Approval state machine, approver identity, decision timestamp and notes.',
      es: 'Control de aprobaciones, aprobador, fecha de decisión y justificación.',
    },
    basis: 'BPMN · Controle de Alçadas',
    defaultTableName: { pt: 'APROVACAO_FLUXO', en: 'WORKFLOW_APPROVAL', es: 'APROBACION_FLUJO' },
    fields: [
      {
        key: 'status',
        name: { pt: 'status_aprovacao', en: 'approval_status', es: 'estado_aprobacion' },
        type: 'varchar',
        length: '25',
        nullable: false,
        recommended: true,
        hint: { pt: 'PENDENTE, APROVADO, REJEITADO', en: 'PENDING, APPROVED, REJECTED', es: 'PENDIENTE, APROBADO, RECHAZADO' },
      },
      {
        key: 'step_number',
        name: { pt: 'etapa_atual', en: 'current_step', es: 'etapa_actual' },
        type: 'int',
        nullable: false,
        recommended: true,
        hint: { pt: 'nível de alçada (1, 2, 3)', en: 'approval tier level', es: 'nivel de aprobación' },
      },
      {
        key: 'requested_by',
        name: { pt: 'solicitado_por', en: 'requested_by', es: 'solicitado_por' },
        type: 'varchar',
        length: '120',
        nullable: false,
        recommended: true,
        hint: { pt: 'autor da solicitação', en: 'requester user ID', es: 'usuario solicitante' },
      },
      {
        key: 'approved_by',
        name: { pt: 'aprovado_por', en: 'approved_by', es: 'aprobado_por' },
        type: 'varchar',
        length: '120',
        nullable: true,
        recommended: true,
        hint: { pt: 'responsável pela decisão', en: 'approver user ID', es: 'usuario aprobador' },
      },
      {
        key: 'decided_at',
        name: { pt: 'decidido_em', en: 'decided_at', es: 'decidido_en' },
        type: 'datetime',
        nullable: true,
        recommended: true,
        hint: { pt: 'data/hora da aprovação/rejeição', en: 'decision timestamp', es: 'fecha y hora de decisión' },
      },
      {
        key: 'justification',
        name: { pt: 'justificativa', en: 'decision_notes', es: 'justificacion' },
        type: 'varchar',
        length: '500',
        nullable: true,
        recommended: false,
        hint: { pt: 'motivo ou comentário da decisão', en: 'approval/rejection remarks', es: 'motivo o comentario' },
      },
    ],
  },
];

export function applyAiOperationsToProject(
  project: ErProjectRecord,
  operations: ErAiOperation[],
  sqlStatements: string[],
  summary: string,
  author: string,
): ErProjectRecord {
  let tables: ErTable[] = project.tables.map((t) => ({
    ...t,
    columns: t.columns.map((c) => ({ ...c })),
  }));
  let relations: ErRelation[] = project.relations.map((r) => ({ ...r }));
  let subModels: ErSubModel[] = project.subModels.map((s) => ({
    ...s,
    tableIds: [...s.tableIds],
    positions: { ...s.positions },
  }));

  const activeSub =
    subModels.find((s) => s.id === project.activeSubModelId) ?? subModels[0];

  const findTable = (name: string) =>
    tables.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());

  const now = new Date().toISOString();

  for (const op of operations) {
    if (op.op === 'create_table') {
      const existing = findTable(op.tableName);
      if (existing) continue;
      const newTable: ErTable = {
        id: createId('tbl'),
        name: op.tableName.trim(),
        description: op.description,
        columns: (op.columns ?? []).map((c) => ({
          id: createId('col'),
          name: c.name,
          type: c.type || 'varchar',
          length: c.length,
          nullable: c.nullable ?? !c.primaryKey,
          primaryKey: Boolean(c.primaryKey),
          identity: Boolean(c.identity),
          defaultValue: c.defaultValue,
        })),
      };
      tables.push(newTable);
      if (activeSub) {
        activeSub.tableIds.push(newTable.id);
        const count = activeSub.tableIds.length;
        activeSub.positions[newTable.id] = {
          x: 80 + ((count - 1) % 3) * 350,
          y: 60 + Math.floor((count - 1) / 3) * 280,
        };
      }
    } else if (op.op === 'rename_table') {
      const tbl = findTable(op.tableName);
      if (tbl && op.newName?.trim()) {
        tbl.name = op.newName.trim();
      }
    } else if (op.op === 'drop_table') {
      const tbl = findTable(op.tableName);
      if (tbl) {
        tables = tables.filter((t) => t.id !== tbl.id);
        relations = relations.filter(
          (r) => r.fromTableId !== tbl.id && r.toTableId !== tbl.id,
        );
        subModels = subModels.map((s) => ({
          ...s,
          tableIds: s.tableIds.filter((tid) => tid !== tbl.id),
        }));
      }
    } else if (op.op === 'add_column') {
      const tbl = findTable(op.tableName);
      if (
        tbl &&
        !tbl.columns.some(
          (c) => c.name.toLowerCase() === op.column.name.toLowerCase(),
        )
      ) {
        const col: ErColumn = {
          id: createId('col'),
          name: op.column.name,
          type: op.column.type || 'varchar',
          length: op.column.length,
          nullable: op.column.nullable ?? true,
          primaryKey: Boolean(op.column.primaryKey),
          identity: Boolean(op.column.identity),
          defaultValue: op.column.defaultValue,
        };
        tbl.columns.push(col);
      }
    } else if (op.op === 'rename_column') {
      const tbl = findTable(op.tableName);
      if (tbl) {
        const col = tbl.columns.find(
          (c) => c.name.toLowerCase() === op.columnName.toLowerCase(),
        );
        if (col && op.newName?.trim()) {
          const oldName = col.name;
          col.name = op.newName.trim();
          relations = relations.map((r) => ({
            ...r,
            fromColumn:
              r.fromTableId === tbl.id && r.fromColumn === oldName
                ? col.name
                : r.fromColumn,
            toColumn:
              r.toTableId === tbl.id && r.toColumn === oldName
                ? col.name
                : r.toColumn,
          }));
        }
      }
    } else if (op.op === 'drop_column') {
      const tbl = findTable(op.tableName);
      if (tbl) {
        tbl.columns = tbl.columns.filter(
          (c) => c.name.toLowerCase() !== op.columnName.toLowerCase(),
        );
        relations = relations.filter(
          (r) =>
            !(
              r.fromTableId === tbl.id &&
              r.fromColumn.toLowerCase() === op.columnName.toLowerCase()
            ) &&
            !(
              r.toTableId === tbl.id &&
              r.toColumn.toLowerCase() === op.columnName.toLowerCase()
            ),
        );
      }
    } else if (op.op === 'add_relation') {
      const fromT = findTable(op.fromTable);
      const toT = findTable(op.toTable);
      if (fromT && toT) {
        if (
          !fromT.columns.some(
            (c) => c.name.toLowerCase() === op.fromColumn.toLowerCase(),
          )
        ) {
          const refCol = toT.columns.find(
            (c) => c.name.toLowerCase() === op.toColumn.toLowerCase(),
          );
          fromT.columns.push({
            id: createId('col'),
            name: op.fromColumn,
            type: refCol?.type ?? 'int',
            length: refCol?.length,
            nullable: op.optional ?? false,
            primaryKey: false,
            identity: false,
          });
        }
        relations.push({
          id: createId('rel'),
          name:
            op.name ||
            `fk_${fromT.name.toLowerCase()}_${toT.name.toLowerCase()}`,
          fromTableId: fromT.id,
          fromColumn: op.fromColumn,
          toTableId: toT.id,
          toColumn: op.toColumn,
          cardinality: op.cardinality ?? '1xN',
          optional: op.optional ?? false,
          onDelete: op.onDelete ?? 'NONE',
        });
      }
    } else if (op.op === 'drop_relation') {
      const fromT = findTable(op.fromTable);
      const toT = findTable(op.toTable);
      if (fromT && toT) {
        relations = relations.filter(
          (r) =>
            !(
              (r.fromTableId === fromT.id && r.toTableId === toT.id) ||
              (r.fromTableId === toT.id && r.toTableId === fromT.id)
            ),
        );
      }
    }
  }

  const newPending: ErPendingChange[] = sqlStatements
    .filter((s) => Boolean(s.trim()))
    .map((sql) => ({
      id: createId('chg'),
      sql,
      description: `Assistente IA: ${summary}`,
      createdAt: now,
    }));

  return {
    ...project,
    tables,
    relations,
    subModels,
    pendingChanges: [...project.pendingChanges, ...newPending],
    history: [
      {
        id: createId('hist'),
        summary: `Assistente IA: ${summary}`,
        author,
        createdAt: now,
      },
      ...project.history,
    ],
  };
}
