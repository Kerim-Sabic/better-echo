import { fireEvent, render, screen } from "@testing-library/react";
import MainFileLlmReport from "../MainFileLlmReport";

describe("MainFileLlmReport", () => {
    it("renders empty state", () => {
        render(
            <MainFileLlmReport
                state="ready"
                showLoading={false}
                isEmpty={true}
                llmReportResults={null}
                diagnosesCount={0}
                isOutOfDate={false}
                isRegenerating={false}
                regenerateError={null}
                canRegenerate={false}
                onRegenerate={jest.fn()}
            />
        );

        expect(screen.getByText("No Report")).toBeInTheDocument();
    });

    it("shows out of date badge and triggers regenerate", () => {
        const onRegenerate = jest.fn();
        render(
            <MainFileLlmReport
                state="ready"
                showLoading={false}
                isEmpty={false}
                llmReportResults={{ report_md: "ok" }}
                diagnosesCount={2}
                isOutOfDate={true}
                isRegenerating={false}
                regenerateError={null}
                canRegenerate={true}
                onRegenerate={onRegenerate}
            />
        );

        expect(screen.getByText("Out of date")).toBeInTheDocument();
        const button = screen.getByRole("button", { name: /Regenerate report/i });
        fireEvent.click(button);
        expect(onRegenerate).toHaveBeenCalled();
    });
});
