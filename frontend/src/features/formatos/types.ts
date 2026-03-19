export type FormatOrigin = 'builtin' | 'uploaded';
export type MappingStrategy = 'legacy_xobject' | 'visual_overlay';

export interface VisualMapping {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    font_size: number;
    font_name: string;
    color_r: number;
    color_g: number;
    color_b: number;
    padding: number;
    blank_x: number | null;
    blank_y: number | null;
    blank_width: number | null;
    blank_height: number | null;
    redraw_top_border: boolean;
    redraw_ot_badge: boolean;
    blank_mcids: number[] | null;
}

export interface FormatInfo {
    id: string;
    nombre: string;
    origen: FormatOrigin;
    enabled: boolean;
    persisted: boolean;
    strategy: MappingStrategy;
    mapping: VisualMapping | null;
    filename_pattern: string;
    max_pages: number;
    number_min: number;
    number_max: number;
    has_mapping: boolean;
}
