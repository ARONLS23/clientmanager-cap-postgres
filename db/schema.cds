namespace arrows.cap.cli;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity Client : cuid, managed {
    code       : String(20);
    name       : String(100);
    description : String(255);
}

entity Project : cuid, managed {
    code        : String(20);
    name        : String(100);
    description : String(255);
    startDate   : Date;
    endDate     : Date;
    status      : String(30);

    client      : Association to Client;
}

entity ProjectMember : cuid, managed {
    fullName : String(100);
    email    : String(120);
    role     : String(50);

    project  : Association to Project;
}

entity Task : cuid, managed {
    title       : String(100);
    description : String(255);
    status      : String(30);
    priority    : String(20);
    dueDate     : Date;

    project     : Association to Project;
    assignee    : Association to ProjectMember;
}

entity Comment : cuid, managed {
    content : String(500);

    task    : Association to Task;
    author  : Association to ProjectMember;
}

entity Document : cuid, managed {
    name        : String(150);
    type        : String(50);
    url         : String(255);
    description : String(255);

    mediaType   : String(100);
    size        : Integer;
    content     : LargeBinary;

    project     : Association to Project;
}

