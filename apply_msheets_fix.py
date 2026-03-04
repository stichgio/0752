import sys
path = r'c:\Users\INTEL\Desktop\GIO\frontend\src\components\tools\MultiSheetReport\MultiSheetReportApp.jsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update SheetPreviewCard
chunk1_old = '''    const rowImages = useMemo(() => {
        if (!rowData || !allImages || allImages.length === 0) return [];'''

chunk1_new = '''    const rowImages = useMemo(() => {
        if (sheet.providedImages) {
            if (sheet.pageNum && sheet.totalPages) {
                const p = sheet.pageNum - 1;
                const size = sheet.imagesPerPage || 4;
                return sheet.providedImages.slice(p * size, (p + 1) * size);
            }
            return sheet.providedImages;
        }
        if (!rowData || !allImages || allImages.length === 0) return [];'''

# 1b. Update rowImages dependency array
chunk1b_old = '''    }, [rowData, allImages, idColumn, sheet.pageNum, sheet.totalPages, sheet.imagesPerPage]);'''
chunk1b_new = '''    }, [rowData, allImages, idColumn, sheet.pageNum, sheet.totalPages, sheet.imagesPerPage, sheet.providedImages]);'''

# 2. Update buildFormData
chunk2_old = '''    const buildFormData = useCallback((rowIndices) => {
        const formData = new FormData();

        const activeSheets = orderSheetsForFirstPage(
            sheets.map((s, sheetIdx) => ({ ...s, _sheetIdx: sheetIdx }))
        );
        const firstPageSheet = activeSheets.find(sheet => sheet.firstPageOnly);
        const regularSheets = activeSheets.filter(sheet => !sheet.firstPageOnly);

        let globalOrder = 0;
        const sheetsConfig = [];
        const allImages = new Set();

        const resolveSheetImages = (sheet, rowImages) => {
            const hasManualSelection = sheet.selectedImageIndices && sheet.selectedImageIndices.length > 0;
            if (hasManualSelection) {
                return sheet.selectedImageIndices.map(idx => images[idx]).filter(Boolean);
            }
            if (sheet.templateName === VOLANTEO_TEMPLATE_NAME) {
                return rowImages.slice(0, 4);
            }
            return rowImages;
        };

        const pushSheetConfigEntries = ({
            sheet,
            rowData,
            rowImages,
            forceSinglePage = false,
        }) => {
            const photosPerPage = sheet.imagesPerPage || 4;
            const sheetImages = resolveSheetImages(sheet, rowImages);

            sheetImages.forEach(img => allImages.add(img));

            if (forceSinglePage) {
                const singlePageImages = sheet.templateName === GRID_TEMPLATE_NAME
                    ? sheetImages.slice(0, photosPerPage)
                    : sheetImages;

                sheetsConfig.push({
                    order: globalOrder++,
                    title: sheet.title,
                    templateName: sheet.templateName,
                    useAltHeader: sheet.useAltHeader,
                    imagesPerPage: photosPerPage,
                    rowData,
                    imageFilenames: singlePageImages.map(img => img.name),
                    pageNum: 1,
                    totalPages: 1,
                });
                return;
            }

            if (sheetImages.length === 0) {
                sheetsConfig.push({
                    order: globalOrder++,
                    title: sheet.title,
                    templateName: sheet.templateName,
                    useAltHeader: sheet.useAltHeader,
                    imagesPerPage: photosPerPage,
                    rowData,
                    imageFilenames: [],
                    pageNum: 1,
                    totalPages: 1,
                });
                return;
            }

            if (sheet.templateName === GRID_TEMPLATE_NAME && sheetImages.length > photosPerPage) {
                const totalPages = Math.ceil(sheetImages.length / photosPerPage);
                for (let p = 0; p < totalPages; p++) {
                    const chunk = sheetImages.slice(p * photosPerPage, (p + 1) * photosPerPage);
                    sheetsConfig.push({
                        order: globalOrder++,
                        title: sheet.title,
                        templateName: sheet.templateName,
                        useAltHeader: sheet.useAltHeader,
                        imagesPerPage: photosPerPage,
                        rowData,
                        imageFilenames: chunk.map(img => img.name),
                        pageNum: p + 1,
                        totalPages,
                    });
                }
                return;
            }

            sheetsConfig.push({
                order: globalOrder++,
                title: sheet.title,
                templateName: sheet.templateName,
                useAltHeader: sheet.useAltHeader,
                imagesPerPage: photosPerPage,
                rowData,
                imageFilenames: sheetImages.map(img => img.name),
                pageNum: 1,
                totalPages: 1,
            });
        };

        if (firstPageSheet && rowIndices.length > 0) {
            const firstRow = data[rowIndices[0]];
            if (firstRow) {
                const firstRowData = { ...firstRow };
                const firstRowImages = getImagesForRow(firstRow);
                pushSheetConfigEntries({
                    sheet: firstPageSheet,
                    rowData: firstRowData,
                    rowImages: firstRowImages,
                    forceSinglePage: true,
                });
            }
        }

        rowIndices.forEach(rowIdx => {
            const row = data[rowIdx];
            if (!row) return;
            const rowData = { ...row };  // pasar toda la fila sin transformación

            const rowImages = getImagesForRow(row);
            regularSheets.forEach(sheet => {
                pushSheetConfigEntries({
                    sheet,
                    rowData,
                    rowImages,
                });
            });
        });'''

chunk2_new = '''    const buildFormData = useCallback((rowIndices) => {
        const formData = new FormData();

        const activeSheets = orderSheetsForFirstPage(
            sheets.map((s, sheetIdx) => ({ ...s, _sheetIdx: sheetIdx }))
        );

        let globalOrder = 0;
        const sheetsConfig = [];
        const allImages = new Set();

        rowIndices.forEach(rowIdx => {
            const row = data[rowIdx];
            if (!row) return;
            const rowData = { ...row };

            let rowImagesForThisRecord = getImagesForRow(row);

            activeSheets.forEach((sheet) => {
                const photosPerPage = sheet.templateName === VOLANTEO_TEMPLATE_NAME ? 4 : (sheet.imagesPerPage || 4);
                
                let sheetImages = [];
                const hasManualSelection = sheet.selectedImageIndices && sheet.selectedImageIndices.length > 0;
                
                if (hasManualSelection) {
                    sheetImages = sheet.selectedImageIndices.map(idx => images[idx]).filter(Boolean);
                } else {
                    sheetImages = [...rowImagesForThisRecord];
                }
                
                sheetImages.forEach(img => allImages.add(img));
                
                if (sheetImages.length === 0) {
                    sheetsConfig.push({
                        order: globalOrder++,
                        title: sheet.title,
                        templateName: sheet.templateName,
                        useAltHeader: sheet.useAltHeader,
                        imagesPerPage: photosPerPage,
                        rowData,
                        imageFilenames: [],
                        pageNum: 1,
                        totalPages: 1,
                    });
                    return;
                }
                
                if (sheet.firstPageOnly) {
                    const chunk = sheetImages.slice(0, photosPerPage);
                    sheetsConfig.push({
                        order: globalOrder++,
                        title: sheet.title,
                        templateName: sheet.templateName,
                        useAltHeader: sheet.useAltHeader,
                        imagesPerPage: photosPerPage,
                        rowData,
                        imageFilenames: chunk.map(img => img.name),
                        pageNum: 1,
                        totalPages: 1,
                    });
                    
                    if (!hasManualSelection) {
                        rowImagesForThisRecord = rowImagesForThisRecord.slice(photosPerPage);
                    }
                } else {
                    const totalPages = Math.ceil(sheetImages.length / photosPerPage);
                    for (let p = 0; p < totalPages; p++) {
                        const chunk = sheetImages.slice(p * photosPerPage, (p + 1) * photosPerPage);
                        sheetsConfig.push({
                            order: globalOrder++,
                            title: sheet.title,
                            templateName: sheet.templateName,
                            useAltHeader: sheet.useAltHeader,
                            imagesPerPage: photosPerPage,
                            rowData,
                            imageFilenames: chunk.map(img => img.name),
                            pageNum: p + 1,
                            totalPages,
                        });
                    }
                    
                    if (!hasManualSelection) {
                        rowImagesForThisRecord = [];
                    }
                }
            });
        });'''

# 3. Update Preview Rendering
chunk3_old = '''                            {(() => {
                                const previewCards = [];
                                let globalIdx = 0;
                                const orderedPreviewSheets = orderSheetsForFirstPage(sheets);

                                orderedPreviewSheets.forEach((sheet) => {
                                    const recordId = idColumn ? selectedRow?.[idColumn] : null;
                                    const rowImages = (recordId && images)
                                        ? images.filter(img => matchesRecordId(img.name, String(recordId)))
                                        : [];

                                    const photosPerPage = sheet.imagesPerPage || 4;
                                    const isGrid = sheet.templateName === GRID_TEMPLATE_NAME;
                                    const shouldPaginateGrid = isGrid && !sheet.firstPageOnly;

                                    if (shouldPaginateGrid && rowImages.length > photosPerPage) {
                                        const totalPages = Math.ceil(rowImages.length / photosPerPage);
                                        for (let p = 0; p < totalPages; p++) {
                                            previewCards.push(
                                                <div key={`${sheet.id}-p${p}`}>
                                                    <SheetPreviewCard
                                                        sheet={{ ...sheet, pageNum: p + 1, totalPages }}
                                                        index={globalIdx++}
                                                        total={999} // se recalcula después o se omite
                                                        headerTitle={headerTitle}
                                                        headerSubtitle={headerSubtitle}
                                                        logoLeft={logoLeft}
                                                        logoRight={logoRight}
                                                        altHeaderConfig={altHeaderConfig}
                                                        rowData={selectedRow}
                                                        allImages={images}
                                                        idColumn={idColumn}
                                                        localTemplateNames={localTemplateNames}
                                                        fetchLocalTemplateHtml={fetchLocalTemplateHtml}
                                                    />
                                                    <div className="flex items-center gap-2 my-2">
                                                        <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                        <span className="text-neutral-600 text-[9px] font-mono whitespace-nowrap">SALTO DE PÁGINA</span>
                                                        <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                    </div>
                                                </div>
                                            );
                                        }
                                    } else {
                                        previewCards.push(
                                            <div key={sheet.id}>
                                                <SheetPreviewCard
                                                    sheet={sheet}
                                                    index={globalIdx++}
                                                    total={999}
                                                    headerTitle={headerTitle}
                                                    headerSubtitle={headerSubtitle}
                                                    logoLeft={logoLeft}
                                                    logoRight={logoRight}
                                                    altHeaderConfig={altHeaderConfig}
                                                    rowData={selectedRow}
                                                    allImages={images}
                                                    idColumn={idColumn}
                                                    localTemplateNames={localTemplateNames}
                                                    fetchLocalTemplateHtml={fetchLocalTemplateHtml}
                                                />
                                                <div className="flex items-center gap-2 my-2">
                                                    <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                    <span className="text-neutral-600 text-[9px] font-mono whitespace-nowrap">SALTO DE SECCIÓN</span>
                                                    <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                </div>
                                            </div>
                                        );
                                    }
                                });
                                return previewCards;
                            })()}'''

chunk3_new = '''                            {(() => {
                                const previewCards = [];
                                let globalIdx = 0;
                                const orderedPreviewSheets = orderSheetsForFirstPage(sheets);
                                
                                const recordId = idColumn ? selectedRow?.[idColumn] : null;
                                const initialRowImages = (recordId && images)
                                    ? images.filter(img => matchesRecordId(img.name, String(recordId)))
                                    : [];
                                
                                let unassignedImagesForPreview = [...initialRowImages];

                                orderedPreviewSheets.forEach((sheet) => {
                                    const photosPerPage = sheet.templateName === VOLANTEO_TEMPLATE_NAME ? 4 : (sheet.imagesPerPage || 4);
                                    
                                    let sheetImages = [];
                                    const hasManualSelection = sheet.selectedImageIndices && sheet.selectedImageIndices.length > 0;
                                    
                                    if (hasManualSelection) {
                                        sheetImages = sheet.selectedImageIndices.map(idx => images[idx]).filter(Boolean);
                                    } else {
                                        sheetImages = [...unassignedImagesForPreview];
                                    }

                                    const shouldPaginate = !sheet.firstPageOnly;

                                    if (shouldPaginate && sheetImages.length > photosPerPage) {
                                        const totalPages = Math.ceil(sheetImages.length / photosPerPage);
                                        for (let p = 0; p < totalPages; p++) {
                                            previewCards.push(
                                                <div key={`${sheet.id}-p${p}`}>
                                                    <SheetPreviewCard
                                                        sheet={{ ...sheet, pageNum: p + 1, totalPages, providedImages: sheetImages }}
                                                        index={globalIdx++}
                                                        total={999}
                                                        headerTitle={headerTitle}
                                                        headerSubtitle={headerSubtitle}
                                                        logoLeft={logoLeft}
                                                        logoRight={logoRight}
                                                        altHeaderConfig={altHeaderConfig}
                                                        rowData={selectedRow}
                                                        allImages={images}
                                                        idColumn={idColumn}
                                                        localTemplateNames={localTemplateNames}
                                                        fetchLocalTemplateHtml={fetchLocalTemplateHtml}
                                                    />
                                                    <div className="flex items-center gap-2 my-2">
                                                        <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                        <span className="text-neutral-600 text-[9px] font-mono whitespace-nowrap">SALTO DE PÁGINA</span>
                                                        <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                    </div>
                                                </div>
                                            );
                                        }
                                        if (!hasManualSelection) unassignedImagesForPreview = [];
                                    } else {
                                        // First page (1°) o menos imágenes que photosPerPage
                                        previewCards.push(
                                            <div key={sheet.id}>
                                                <SheetPreviewCard
                                                    sheet={{ ...sheet, providedImages: sheetImages }}
                                                    index={globalIdx++}
                                                    total={999}
                                                    headerTitle={headerTitle}
                                                    headerSubtitle={headerSubtitle}
                                                    logoLeft={logoLeft}
                                                    logoRight={logoRight}
                                                    altHeaderConfig={altHeaderConfig}
                                                    rowData={selectedRow}
                                                    allImages={images}
                                                    idColumn={idColumn}
                                                    localTemplateNames={localTemplateNames}
                                                    fetchLocalTemplateHtml={fetchLocalTemplateHtml}
                                                />
                                                <div className="flex items-center gap-2 my-2">
                                                    <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                    <span className="text-neutral-600 text-[9px] font-mono whitespace-nowrap">SALTO DE SECCIÓN</span>
                                                    <div className="flex-1 border-b border-neutral-600 border-dashed" />
                                                </div>
                                            </div>
                                        );
                                        if (!hasManualSelection && sheet.firstPageOnly) {
                                            unassignedImagesForPreview = unassignedImagesForPreview.slice(photosPerPage);
                                        } else if (!hasManualSelection) {
                                            unassignedImagesForPreview = [];
                                        }
                                    }
                                });
                                return previewCards;
                            })()}'''

def apply_chunk(old, new, name):
    global content
    old_crlf = old.replace('\n', '\r\n')
    if old in content:
        content = content.replace(old, new)
        print(f'{name} replaced (LF).')
    elif old_crlf in content:
        content = content.replace(old_crlf, new.replace('\n', '\r\n'))
        print(f'{name} replaced (CRLF).')
    else:
        print(f'{name} NOT found!')

apply_chunk(chunk1_old, chunk1_new, 'Chunk 1')
apply_chunk(chunk1b_old, chunk1b_new, 'Chunk 1b')
apply_chunk(chunk2_old, chunk2_new, 'Chunk 2')
apply_chunk(chunk3_old, chunk3_new, 'Chunk 3')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
