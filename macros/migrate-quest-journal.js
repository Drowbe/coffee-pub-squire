const squire = game.modules.get('coffee-pub-squire')?.api;
if (typeof squire?.migrateQuestJournalData !== 'function') {
    return ui.notifications.error('Coffee Pub Squire quest migration is unavailable.');
}

try {
    const result = await squire.migrateQuestJournalData();
    ui.notifications.info(
        `Migrated "${result.journalName}": ${result.updated} updated, ${result.unchanged} unchanged.`
    );
    await squire.PanelManager?.instance?.questPanel?._refreshData?.();
    await squire.PanelManager?.instance?.questPanel?.render?.(squire.PanelManager.element);
} catch (error) {
    console.error('Coffee Pub Squire | Quest journal migration failed:', error);
    ui.notifications.error(`Quest journal migration failed: ${error.message}`);
}
