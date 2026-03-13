import { render, screen } from "@testing-library/react";
import LlmReportBox from "../LlmReportBox";

describe("LlmReportBox", () => {
    it("renders backend-provided display sections", () => {
        render(
            <LlmReportBox
                llmReportResults={{
                    diagnoses_json: [{ label: "Normal study", rationale: "Consistent measurements", confidence: 0.92 }],
                    report_md: "# Raw title should not be reparsed",
                    display: {
                        mainTitle: "Clinical Echo Report",
                        sections: [
                            { title: "Findings", body: "Normal LV function." },
                            { title: "Impression", body: "No major abnormality." },
                        ],
                    },
                }}
            />
        );

        expect(screen.getByText("Clinical Echo Report")).toBeInTheDocument();
        expect(screen.getByText("Findings")).toBeInTheDocument();
        expect(screen.getByText("Normal LV function.")).toBeInTheDocument();
        expect(screen.getByText("Impression")).toBeInTheDocument();
        expect(screen.getByText("No major abnormality.")).toBeInTheDocument();
        expect(screen.getByText("Normal study")).toBeInTheDocument();
    });
});
