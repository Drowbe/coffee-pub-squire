import { MODULE, TEMPLATES } from './const.js';

export class PrintCharacterSheet {
    static async print(actor) {
        if (!actor) return;

        // Render the print template
        const html = await renderTemplate(TEMPLATES.PRINT_CHARACTER, {
            actor: actor
        });

        // Create a new window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            ui.notifications.error('Pop-up blocked. Please allow pop-ups for this site.');
            return;
        }

        // Write the content to the new window
        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for images to load
        await new Promise(resolve => {
            const images = printWindow.document.getElementsByTagName('img');
            let loadedImages = 0;
            const totalImages = images.length;

            if (totalImages === 0) {
                resolve();
                return;
            }

            for (let img of images) {
                if (img.complete) {
                    loadedImages++;
                    if (loadedImages === totalImages) resolve();
                } else {
                    img.onload = () => {
                        loadedImages++;
                        if (loadedImages === totalImages) resolve();
                    };
                    img.onerror = () => {
                        loadedImages++;
                        if (loadedImages === totalImages) resolve();
                    };
                }
            }
        });

        // Do NOT trigger print dialog automatically. User can print from the new tab if desired.
    }
} 