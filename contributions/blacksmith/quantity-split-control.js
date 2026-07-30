/**
 * Attach Squire's Give / Keep behavior to rendered quantity controls.
 *
 * The selected value is "Give"; Keep is always max - Give. The controller
 * owns no submit/close lifecycle and can be embedded in a Tool or Dialog.
 */
export function attachQuantitySplit(root, { onChange = null } = {}) {
    const controls = [];

    for (const element of root?.querySelectorAll?.('[data-quantity-split]') ?? []) {
        const input = element.querySelector('input[type="range"]');
        const give = element.querySelector('[data-quantity-give]');
        const keep = element.querySelector('[data-quantity-keep]');
        if (!input || !give || !keep) continue;

        const update = sourceEvent => {
            const minimum = Number(input.min || element.dataset.min) || 1;
            const maximum = Math.max(minimum, Number(input.max || element.dataset.max) || minimum);
            const value = Math.clamp
                ? Math.clamp(Number(input.value) || minimum, minimum, maximum)
                : Math.min(maximum, Math.max(minimum, Number(input.value) || minimum));
            input.value = String(value);
            give.value = give.textContent = String(value);
            keep.value = keep.textContent = String(Math.max(0, maximum - value));
            onChange?.({ value, keep: maximum - value, min: minimum, max: maximum, input, sourceEvent });
        };

        const listener = event => update(event);
        input.addEventListener('input', listener);
        update(null);
        controls.push({
            element,
            input,
            getValue: () => Number(input.value),
            setValue(value) {
                input.value = String(value);
                update(null);
            },
            destroy() {
                input.removeEventListener('input', listener);
            }
        });
    }

    return controls.length === 1 ? controls[0] : controls;
}
