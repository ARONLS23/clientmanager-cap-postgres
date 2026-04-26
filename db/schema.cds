namespace arrows.cap.cli;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity client : cuid, managed {
    code       : String(20);
    name       : String(100);
    description : String(255);
}
