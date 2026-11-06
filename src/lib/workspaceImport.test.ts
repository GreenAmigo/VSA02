import { describe, expect, it } from "vitest";

import { parseWorkspaceCsv } from "./workspaceImport";

describe("parseWorkspaceCsv", () => {
  it("groups Excel rows into workspace objects and nested project/vendor/requirement/score arrays", () => {
    const csv = `workspace_id,workspace_slug,workspace_name,workspace_domain,project_id,project_name,project_status,vendor_count,scorer_count,requirement_count,leading_vendor,person_id,person_name,person_role,person_team,person_project,vendor_id,vendor_name,vendor_status,vendor_project,vendor_score,requirement_id,requirement_title,requirement_type,requirement_priority,requirement_status,score_scorer,score_vendor,score_value,score_status
ws-acme,acme-health,Acme Health,acme.vs.app,project-1,HR Platform Review,Active,3,5,18,Northwind Labs,person-1,Priya Singh,VS Consultant,Delivery,Workspace,vendor-1,Northwind Labs,Active,HR Platform Review,89,REQ-101,Recruitment workflow reporting,Functional,High,Active,Priya Singh,Northwind Labs,89,Submitted
ws-acme,acme-health,Acme Health,acme.vs.app,project-2,Payroll Platform,Draft,2,3,9,Pending,person-2,Marcus Reed,Project owner,Operations,HR Platform Review,,,,,,,REQ-102,Audit and logging controls,Non-Functional,High,Active,Operations Team,Northwind Labs,84,Submitted`;

    const result = parseWorkspaceCsv(csv);

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("acme-health");
    expect(result[0].projects).toHaveLength(2);
    expect(result[0].people).toHaveLength(2);
    expect(result[0].vendors).toHaveLength(1);
    expect(result[0].requirements).toHaveLength(2);
    expect(result[0].scores).toHaveLength(2);
  });
});
