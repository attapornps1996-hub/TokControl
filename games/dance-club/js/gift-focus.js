/**
 * Gift / focus interaction — float dancer + cinematic camera + light burst.
 */
export function createGiftFocusSystem({ cameraCtrl, dancers, sceneApi, onToast }) {
    let selectedId = dancers[0] ? dancers[0].profile.id : null;
    let busyUntil = 0;
    const queue = [];

    function findDancer(id) {
        return dancers.find((d) => d.profile.id === id) || null;
    }

    function setSelected(id) {
        if (findDancer(id)) selectedId = id;
        return selectedId;
    }

    function getSelected() {
        return selectedId;
    }

    function holdFor(coins) {
        if (coins >= 500) return 5.2;
        if (coins >= 100) return 4.2;
        if (coins >= 20) return 3.6;
        return 3.0;
    }

    /**
     * Focus a dancer for a gift.
     * @param {object} opts
     * @param {string} [opts.dancerId]
     * @param {string} [opts.giftName]
     * @param {number} [opts.coins]
     * @param {string} [opts.from]
     * @param {boolean} [opts.queueIfBusy]
     */
    function triggerGift(opts = {}) {
        const now = performance.now();
        if (now < busyUntil) {
            if (opts.queueIfBusy !== false && queue.length < 6) queue.push(opts);
            return false;
        }

        const dancer = findDancer(opts.dancerId || selectedId) || dancers[0];
        if (!dancer) return false;

        selectedId = dancer.profile.id;
        const giftName = opts.giftName || 'Rose';
        const coins = opts.coins != null ? opts.coins : 1;
        const from = opts.from || 'Viewer';
        const hold = holdFor(coins);

        dancer.setGiftFloat(0.9 + Math.min(0.8, coins / 900));

        // Track the head as it dances instead of a frozen point
        cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
            duration: hold,
            distance: coins >= 100 ? 5.4 : 6.4,
            height: 0.5
        });

        // Punch the rig for big gifts
        if (sceneApi && coins >= 100) {
            sceneApi.setPattern('lockCenter');
            setTimeout(() => sceneApi.setPattern('sweep'), hold * 1000);
        }

        if (typeof onToast === 'function') {
            onToast(`🎁 @${from} → ${dancer.profile.name}\n${giftName} · ${coins}🪙`);
        }

        busyUntil = now + hold * 1000 + 400;
        setTimeout(() => dancer.setGiftFloat(0), hold * 1000);
        setTimeout(() => {
            const next = queue.shift();
            if (next) triggerGift(next);
        }, hold * 1000 + 500);
        return true;
    }

    /** Convenience mock for the UI test button */
    function mockRandomGift() {
        if (!dancers.length) return false;
        const dancer = dancers[Math.floor(Math.random() * dancers.length)];
        const gifts = [
            { giftName: 'Rose', coins: 1 },
            { giftName: 'TikTok', coins: 1 },
            { giftName: 'Perfume', coins: 20 },
            { giftName: 'Universe', coins: 699 },
            { giftName: 'Lion', coins: 299 }
        ];
        const g = gifts[Math.floor(Math.random() * gifts.length)];
        return triggerGift({
            dancerId: dancer.profile.id,
            giftName: g.giftName,
            coins: g.coins,
            from: 'TestUser'
        });
    }

    return {
        setSelected,
        getSelected,
        triggerGift,
        mockRandomGift,
        get pending() { return queue.length; }
    };
}

/** Expose for Game Center / socket bridge later */
export function attachGiftApi(system) {
    window.DanceClubGift = {
        trigger: (payload) => system.triggerGift(payload || {}),
        mock: () => system.mockRandomGift(),
        select: (id) => system.setSelected(id),
        selected: () => system.getSelected()
    };
}
