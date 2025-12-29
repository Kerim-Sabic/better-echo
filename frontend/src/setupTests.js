// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

jest.mock("react-markdown", () => ({
    __esModule: true,
    default: ({ children }) => children,
}));

const mediaElementTypes = [HTMLMediaElement, HTMLVideoElement, HTMLAudioElement].filter(
    (elementType) => typeof elementType !== "undefined",
);

const setMediaMethod = (elementType, methodName, implementation) => {
    if (!elementType?.prototype) {
        return;
    }
    try {
        Object.defineProperty(elementType.prototype, methodName, {
            configurable: true,
            writable: true,
            value: implementation,
        });
    } catch {
        try {
            elementType.prototype[methodName] = implementation;
        } catch {}
    }
};

const mediaNoop = () => {};
const mediaPlay = () => Promise.resolve();

mediaElementTypes.forEach((elementType) => {
    setMediaMethod(elementType, "load", mediaNoop);
    setMediaMethod(elementType, "play", mediaPlay);
    setMediaMethod(elementType, "pause", mediaNoop);
});
