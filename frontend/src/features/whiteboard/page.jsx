import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './gioboard.css';

export default function GioBoardPage() {
    return (
        <div className="h-full w-full">
            <Excalidraw
                theme="dark"
                langCode="es-ES"
                initialData={{
                    appState: { theme: 'dark' },
                }}
                UIOptions={{
                    canvasActions: {
                        toggleTheme: false,
                        export: false,
                        loadScene: false,
                        saveAsImage: true,
                        clearCanvas: true,
                        changeViewBackgroundColor: false,
                    },
                }}
                renderTopRightUI={() => null}
            >
                <MainMenu>
                    <MainMenu.DefaultItems.SaveAsImage />
                    <MainMenu.DefaultItems.ClearCanvas />
                </MainMenu>
            </Excalidraw>
        </div>
    );
}
